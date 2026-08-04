import { createHash } from "node:crypto";
import { join } from "node:path";
import { Transform } from "node:stream";
import { crc32 } from "node:zlib";
import { assertPathBudget, PathBudgetError, PathTraversalError } from "@cs/shared";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import type { FileEntry, FileSystemPort } from "./filesystem.js";
import { toFileSystemPath } from "./filesystem.js";
import { asTransferFailure, PermanentTransferFailure, TransferFailure } from "./transfer-errors.js";

const WINDOWS_ILLEGAL = /[<>:"\\|?*]/u;
const WINDOWS_RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const MAX_ARCHIVE_FILES = 100_000;
const MAX_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024 * 1024;

export type ManifestArtifact = {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  stage: "STAGED";
};

export type StagingVerificationInput = {
  batchId: string;
  stagingRoot: string;
  backupRoot: string;
  productionRoot: string;
  clientFolder: string;
  orderFolder: string;
  batchSubfolder: string;
};

export type StagingVerificationResult = {
  directory: string;
  artifacts: readonly ManifestArtifact[];
  bytesTotal: number;
};

function canonicalParts(relativePath: string): string[] {
  const normalised = relativePath.replaceAll("\\", "/");
  if (normalised.startsWith("/") || /^[A-Za-z]:/u.test(normalised) || normalised.includes("\0")) {
    throw new PathTraversalError(relativePath);
  }
  const parts = normalised.split("/").filter((part, index, all) => {
    return !(part.length === 0 && index === all.length - 1);
  });
  if (parts.length === 0) {
    throw new PathTraversalError(relativePath);
  }
  for (const part of parts) {
    const hasControlCharacter = Array.from(part).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
    });
    if (
      part.length === 0 ||
      part === "." ||
      part === ".." ||
      WINDOWS_ILLEGAL.test(part) ||
      hasControlCharacter ||
      /[.\s]$/u.test(part) ||
      WINDOWS_RESERVED.test(part)
    ) {
      throw new PathTraversalError(relativePath);
    }
  }
  return parts;
}

function assertDestinationBudget(input: StagingVerificationInput, relativePath: string): void {
  const parts = canonicalParts(relativePath);
  const fileName = parts.at(-1);
  if (!fileName) throw new PathTraversalError(relativePath);
  const segments = [
    input.clientFolder,
    input.orderFolder,
    input.batchSubfolder,
    ...parts.slice(0, -1),
  ];
  assertPathBudget(input.backupRoot, segments, fileName);
  assertPathBudget(input.productionRoot, segments, fileName);
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      toFileSystemPath(path),
      {
        autoClose: false,
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (error, zipFile) => {
        if (error) {
          reject(error);
        } else if (!zipFile) {
          reject(new Error("ZIP file could not be opened"));
        } else {
          resolve(zipFile);
        }
      },
    );
  });
}

function nextEntry(zipFile: ZipFile): Promise<Entry | null> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      zipFile.off("entry", onEntry);
      zipFile.off("end", onEnd);
      zipFile.off("error", onError);
    };
    const onEntry = (entry: Entry) => {
      cleanup();
      resolve(entry);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    zipFile.once("entry", onEntry);
    zipFile.once("end", onEnd);
    zipFile.once("error", onError);
    zipFile.readEntry();
  });
}

function openEntryStream(zipFile: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
      } else if (!stream) {
        reject(new Error(`ZIP entry ${entry.fileName} could not be read`));
      } else {
        resolve(stream);
      }
    });
  });
}

function isSymbolicLink(entry: Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

async function extractZip(
  fileSystem: FileSystemPort,
  archive: FileEntry,
  stagedDirectory: string,
  input: StagingVerificationInput,
): Promise<void> {
  let zipFile: ZipFile;
  try {
    zipFile = await openZip(archive.absolutePath);
  } catch (error) {
    throw new PermanentTransferFailure(`Archive ${archive.relativePath} is invalid`, {
      cause: error,
    });
  }

  let fileCount = 0;
  let expandedBytes = 0;
  try {
    for (;;) {
      const entry = await nextEntry(zipFile);
      if (!entry) break;
      const isDirectory = entry.fileName.endsWith("/");
      const parts = canonicalParts(entry.fileName);
      if (isSymbolicLink(entry)) {
        throw new PathTraversalError(`Symbolic link in archive: ${entry.fileName}`);
      }
      if (isDirectory) {
        await fileSystem.ensureDirectory(join(stagedDirectory, ...parts));
        continue;
      }

      fileCount += 1;
      expandedBytes += entry.uncompressedSize;
      if (fileCount > MAX_ARCHIVE_FILES || expandedBytes > MAX_EXPANDED_BYTES) {
        throw new PermanentTransferFailure(
          `Archive ${archive.relativePath} exceeds extraction safety limits`,
        );
      }
      assertDestinationBudget(input, parts.join("/"));

      const target = join(stagedDirectory, ...parts);
      await fileSystem.ensureDirectory(join(target, ".."));
      const stream = await openEntryStream(zipFile, entry);
      let actualCrc = 0;
      let actualBytes = 0;
      const verifier = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          actualBytes += chunk.byteLength;
          actualCrc = crc32(chunk, actualCrc);
          callback(null, chunk);
        },
      });
      await fileSystem.writeStream(target, stream.pipe(verifier));
      if (actualBytes !== entry.uncompressedSize || actualCrc !== entry.crc32) {
        throw new PermanentTransferFailure(
          `Archive ${archive.relativePath} failed integrity verification at ${entry.fileName}`,
        );
      }
    }
  } catch (error) {
    if (
      error instanceof TransferFailure ||
      error instanceof PathTraversalError ||
      error instanceof PathBudgetError
    ) {
      throw error;
    }
    throw new PermanentTransferFailure(`Archive ${archive.relativePath} is corrupt`, {
      cause: error,
    });
  } finally {
    zipFile.close();
  }
}

async function copyNonArchive(
  fileSystem: FileSystemPort,
  source: FileEntry,
  stagedDirectory: string,
  input: StagingVerificationInput,
): Promise<void> {
  const parts = canonicalParts(source.relativePath);
  assertDestinationBudget(input, parts.join("/"));
  const target = join(stagedDirectory, ...parts);
  await fileSystem.ensureDirectory(join(target, ".."));
  await fileSystem.writeStream(target, fileSystem.readStream(source.absolutePath));
}

async function sha256(fileSystem: FileSystemPort, path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fileSystem.readStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export class StagingVerifier {
  private readonly fileSystem: FileSystemPort;

  constructor(fileSystem: FileSystemPort) {
    this.fileSystem = fileSystem;
  }

  async verify(input: StagingVerificationInput): Promise<StagingVerificationResult> {
    const downloadDirectory = join(input.stagingRoot, "batches", input.batchId, "download");
    const stagedDirectory = join(input.stagingRoot, "batches", input.batchId, "staged");
    const downloaded = await this.fileSystem
      .listFiles(downloadDirectory)
      .catch((error: unknown) => {
        throw new PermanentTransferFailure(
          `Downloaded content for batch ${input.batchId} is missing`,
          {
            cause: error,
          },
        );
      });
    if (downloaded.length === 0) {
      throw new PermanentTransferFailure(`Downloaded content for batch ${input.batchId} is empty`);
    }
    const empty = downloaded.find((file) => file.sizeBytes === 0);
    if (empty) {
      throw new PermanentTransferFailure(`Zero-byte file is not allowed: ${empty.relativePath}`);
    }

    await this.fileSystem.remove(stagedDirectory);
    await this.fileSystem.ensureDirectory(stagedDirectory);
    try {
      for (const file of downloaded) {
        if (/\.zip$/iu.test(file.relativePath)) {
          await extractZip(this.fileSystem, file, stagedDirectory, input);
        } else {
          await copyNonArchive(this.fileSystem, file, stagedDirectory, input);
        }
      }

      const stagedFiles = await this.fileSystem.listFiles(stagedDirectory);
      if (stagedFiles.length === 0) {
        throw new PermanentTransferFailure("Staged content contains no files");
      }
      const artifacts: ManifestArtifact[] = [];
      for (const file of stagedFiles) {
        if (file.sizeBytes === 0) {
          throw new PermanentTransferFailure(`Zero-byte file is not allowed: ${file.relativePath}`);
        }
        assertDestinationBudget(input, file.relativePath);
        artifacts.push({
          relativePath: file.relativePath,
          sizeBytes: file.sizeBytes,
          sha256: await sha256(this.fileSystem, file.absolutePath),
          stage: "STAGED",
        });
      }
      return {
        directory: stagedDirectory,
        artifacts,
        bytesTotal: artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0),
      };
    } catch (error) {
      await this.fileSystem.remove(stagedDirectory);
      if (error instanceof PathTraversalError || error instanceof PathBudgetError) {
        throw new PermanentTransferFailure(error.message, { cause: error });
      }
      throw asTransferFailure(error, "Staging verification failed");
    }
  }
}
