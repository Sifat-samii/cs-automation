import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { FileSystemPort } from "./filesystem.js";
import { toFileSystemPath } from "./filesystem.js";
import type { ManifestArtifact } from "./staging.js";
import {
  asTransferFailure,
  PermanentTransferFailure,
  TransientTransferFailure,
} from "./transfer-errors.js";

const MARKER_FILE_NAME = ".cs-order.json";
const MARKER_SCHEMA_VERSION = 1;
const MARKER_MAX_BYTES = 64 * 1024;
const FREE_SPACE_MARGIN_BYTES = 256 * 1024 * 1024;

export type OrderMarker = {
  orderId: string;
  orderCode: string;
  clientCode: string;
  createdAtUtc: string;
  schemaVersion: 1;
};

export type TransferLocation = {
  batchId: string;
  backupRoot: string;
  productionRoot: string;
  stagingRoot: string;
  clientFolder: string;
  orderFolder: string;
  batchSubfolder: string;
  orderId: string;
  orderCode: string;
  clientCode: string;
  createdAtUtc: string;
};

export type PublishedTransfer = {
  directory: string;
  artifacts: readonly PublishedArtifact[];
  bytesTotal: number;
};

export type PublishedArtifact = Omit<ManifestArtifact, "stage"> & {
  stage: "BACKUP" | "PRODUCTION";
};

export interface TreeCopyStrategy {
  copy(source: string, destination: string): Promise<void>;
}

export class PortTreeCopyStrategy implements TreeCopyStrategy {
  private readonly fileSystem: FileSystemPort;

  constructor(fileSystem: FileSystemPort) {
    this.fileSystem = fileSystem;
  }

  async copy(source: string, destination: string): Promise<void> {
    await this.fileSystem.copyTree(source, destination);
  }
}

export class RobocopyTreeCopyStrategy implements TreeCopyStrategy {
  async copy(source: string, destination: string): Promise<void> {
    if (process.platform !== "win32") {
      throw new PermanentTransferFailure("Robocopy transfer strategy requires Windows");
    }

    const exitCode = await new Promise<number>((resolve, reject) => {
      const processHandle = spawn(
        "robocopy.exe",
        [
          toFileSystemPath(source),
          toFileSystemPath(destination),
          "/E",
          "/COPY:DAT",
          "/DCOPY:DAT",
          "/Z",
          "/FFT",
          "/R:3",
          "/W:5",
          "/NP",
          "/NFL",
          "/NDL",
          "/NJH",
          "/NJS",
        ],
        {
          windowsHide: true,
          stdio: "ignore",
        },
      );
      processHandle.once("error", reject);
      processHandle.once("exit", (code) => resolve(code ?? 16));
    }).catch((error: unknown) => {
      throw new TransientTransferFailure("Robocopy could not be started", { cause: error });
    });

    if (exitCode >= 8) {
      throw new TransientTransferFailure(`Robocopy failed with exit code ${exitCode}`);
    }
  }
}

function totalManifestBytes(artifacts: readonly ManifestArtifact[]): number {
  return artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0);
}

async function sha256(fileSystem: FileSystemPort, path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fileSystem.readStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function readSmallText(fileSystem: FileSystemPort, path: string): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of fileSystem.readStream(path)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MARKER_MAX_BYTES) {
      throw new PermanentTransferFailure(`Order marker exceeds ${MARKER_MAX_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function markerFor(input: TransferLocation): OrderMarker {
  const createdAt = new Date(input.createdAtUtc);
  if (Number.isNaN(createdAt.getTime())) {
    throw new PermanentTransferFailure("Order marker creation timestamp is invalid");
  }
  return {
    orderId: input.orderId,
    orderCode: input.orderCode,
    clientCode: input.clientCode,
    createdAtUtc: createdAt.toISOString(),
    schemaVersion: MARKER_SCHEMA_VERSION,
  };
}

function markerMatches(value: unknown, expected: OrderMarker): boolean {
  if (typeof value !== "object" || value === null) return false;
  const marker = value as Record<string, unknown>;
  return (
    marker.orderId === expected.orderId &&
    marker.orderCode === expected.orderCode &&
    marker.clientCode === expected.clientCode &&
    marker.createdAtUtc === expected.createdAtUtc &&
    marker.schemaVersion === expected.schemaVersion
  );
}

async function ensureMarker(
  fileSystem: FileSystemPort,
  orderDirectory: string,
  expected: OrderMarker,
): Promise<void> {
  const path = join(orderDirectory, MARKER_FILE_NAME);
  const existing = await fileSystem.stat(path);
  if (existing) {
    if (!existing.isFile) {
      throw new PermanentTransferFailure("Order marker path exists but is not a file");
    }
    let value: unknown;
    try {
      value = JSON.parse(await readSmallText(fileSystem, path));
    } catch (error) {
      throw new PermanentTransferFailure("Existing order marker is invalid", { cause: error });
    }
    if (!markerMatches(value, expected)) {
      throw new PermanentTransferFailure("Existing order marker belongs to a different order");
    }
    return;
  }

  const partial = `${path}.partial`;
  await fileSystem.remove(partial);
  try {
    await fileSystem.writeStream(
      partial,
      Readable.from(`${JSON.stringify(expected, null, 2)}\n`, { encoding: "utf8" }),
    );
    await fileSystem.move(partial, path);
  } catch (error) {
    await fileSystem.remove(partial);
    throw asTransferFailure(error, "Order marker write failed");
  }
}

async function assertFreeSpace(
  fileSystem: FileSystemPort,
  roots: readonly string[],
  bytesRequired: number,
): Promise<void> {
  const required = bytesRequired + FREE_SPACE_MARGIN_BYTES;
  for (const root of roots) {
    let available: number;
    try {
      available = await fileSystem.freeSpaceBytes(root);
    } catch (error) {
      throw new TransientTransferFailure(`Free-space check failed for ${root}`, { cause: error });
    }
    if (available < required) {
      throw new PermanentTransferFailure(
        `Insufficient free space: ${available} bytes available, ${required} bytes required`,
      );
    }
  }
}

async function verifyManifest(
  fileSystem: FileSystemPort,
  directory: string,
  expected: readonly ManifestArtifact[],
  stage: "BACKUP" | "PRODUCTION",
): Promise<PublishedTransfer> {
  const files = await fileSystem.listFiles(directory);
  const expectedByPath = new Map(expected.map((artifact) => [artifact.relativePath, artifact]));
  if (files.length !== expectedByPath.size) {
    throw new PermanentTransferFailure(
      `${stage} manifest file count mismatch: expected ${expectedByPath.size}, found ${files.length}`,
    );
  }

  const artifacts: PublishedArtifact[] = [];
  for (const file of files) {
    const manifest = expectedByPath.get(file.relativePath);
    if (!manifest) {
      throw new PermanentTransferFailure(`${stage} contains unexpected file ${file.relativePath}`);
    }
    if (file.sizeBytes !== manifest.sizeBytes) {
      throw new PermanentTransferFailure(`${stage} size mismatch for ${file.relativePath}`);
    }
    const checksum = await sha256(fileSystem, file.absolutePath);
    if (checksum !== manifest.sha256) {
      throw new PermanentTransferFailure(`${stage} checksum mismatch for ${file.relativePath}`);
    }
    artifacts.push({ ...manifest, stage });
  }
  artifacts.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return {
    directory,
    artifacts,
    bytesTotal: artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0),
  };
}

async function prepareDestination(
  fileSystem: FileSystemPort,
  destination: string,
  expected: readonly ManifestArtifact[],
  stage: "BACKUP" | "PRODUCTION",
): Promise<PublishedTransfer | null> {
  const existing = await fileSystem.stat(destination);
  if (!existing) return null;
  if (!existing.isDirectory) {
    throw new PermanentTransferFailure(`${stage} destination exists and is not a directory`);
  }
  const files = await fileSystem.listFiles(destination);
  if (files.length === 0) {
    await fileSystem.remove(destination);
    return null;
  }

  try {
    return await verifyManifest(fileSystem, destination, expected, stage);
  } catch (error) {
    throw new PermanentTransferFailure(
      `${stage} destination exists and is non-empty; refusing to overwrite`,
      { cause: error },
    );
  }
}

export class TransferPublisher {
  private readonly fileSystem: FileSystemPort;
  private readonly productionCopy: TreeCopyStrategy;

  constructor(fileSystem: FileSystemPort, productionCopy: TreeCopyStrategy) {
    this.fileSystem = fileSystem;
    this.productionCopy = productionCopy;
  }

  async writeBackup(
    input: TransferLocation,
    manifest: readonly ManifestArtifact[],
  ): Promise<PublishedTransfer> {
    const bytesTotal = totalManifestBytes(manifest);
    if (manifest.length === 0 || bytesTotal === 0) {
      throw new PermanentTransferFailure("Cannot publish an empty manifest");
    }
    await assertFreeSpace(this.fileSystem, [input.stagingRoot, input.backupRoot], bytesTotal);

    const staged = join(input.stagingRoot, "batches", input.batchId, "staged");
    await verifyManifest(this.fileSystem, staged, manifest, "BACKUP");
    const orderDirectory = join(input.backupRoot, input.clientFolder, input.orderFolder);
    const destination = join(orderDirectory, input.batchSubfolder);
    await this.fileSystem.ensureDirectory(orderDirectory);
    await ensureMarker(this.fileSystem, orderDirectory, markerFor(input));

    const resumed = await prepareDestination(this.fileSystem, destination, manifest, "BACKUP");
    if (resumed) return resumed;

    const partial = join(orderDirectory, `.cs-transfer-${input.batchId}-backup`);
    await this.fileSystem.remove(partial);
    try {
      await this.fileSystem.copyTree(staged, partial);
      const verified = await verifyManifest(this.fileSystem, partial, manifest, "BACKUP");
      await this.fileSystem.move(partial, destination);
      return { ...verified, directory: destination };
    } catch (error) {
      await this.fileSystem.remove(partial);
      throw asTransferFailure(error, "Backup write failed");
    }
  }

  async copyProduction(
    input: TransferLocation,
    manifest: readonly ManifestArtifact[],
  ): Promise<PublishedTransfer> {
    const bytesTotal = totalManifestBytes(manifest);
    if (manifest.length === 0 || bytesTotal === 0) {
      throw new PermanentTransferFailure("Cannot publish an empty manifest");
    }
    await assertFreeSpace(this.fileSystem, [input.stagingRoot, input.productionRoot], bytesTotal);

    const backupBatch = join(
      input.backupRoot,
      input.clientFolder,
      input.orderFolder,
      input.batchSubfolder,
    );
    await verifyManifest(this.fileSystem, backupBatch, manifest, "BACKUP");

    const orderDirectory = join(input.productionRoot, input.clientFolder, input.orderFolder);
    const destination = join(orderDirectory, input.batchSubfolder);
    await this.fileSystem.ensureDirectory(orderDirectory);
    await ensureMarker(this.fileSystem, orderDirectory, markerFor(input));

    const resumed = await prepareDestination(this.fileSystem, destination, manifest, "PRODUCTION");
    if (resumed) return resumed;

    const partial = join(orderDirectory, `.cs-transfer-${input.batchId}-production`);
    await this.fileSystem.remove(partial);
    try {
      await this.productionCopy.copy(backupBatch, partial);
      const verified = await verifyManifest(this.fileSystem, partial, manifest, "PRODUCTION");
      await this.fileSystem.move(partial, destination);
      return { ...verified, directory: destination };
    } catch (error) {
      await this.fileSystem.remove(partial);
      throw asTransferFailure(error, "Production copy failed");
    }
  }
}
