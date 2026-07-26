import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TempDirectoryFileSystem } from "./filesystem.js";
import type { ManifestArtifact } from "./staging.js";
import {
  PortTreeCopyStrategy,
  toRobocopyPath,
  TransferPublisher,
  type TransferLocation,
  type TreeCopyStrategy,
} from "./transfer.js";

describe("backup and production publication", () => {
  let fileSystem: TempDirectoryFileSystem;
  let publisher: TransferPublisher;
  let input: TransferLocation;
  let manifest: readonly ManifestArtifact[];
  let stagedFile: string;

  beforeEach(async () => {
    fileSystem = await TempDirectoryFileSystem.create();
    publisher = new TransferPublisher(fileSystem, new PortTreeCopyStrategy(fileSystem));
    input = {
      batchId: "33333333-3333-4333-8333-333333333333",
      attempt: 1,
      backupRoot: fileSystem.resolve("backup"),
      productionRoot: fileSystem.resolve("production"),
      stagingRoot: fileSystem.root,
      clientFolder: "Verily",
      orderFolder: "VRLY_260726_001__spring_drop",
      batchSubfolder: "01_INITIAL",
      orderId: "44444444-4444-4444-8444-444444444444",
      orderCode: "VRLY_260726_001",
      clientCode: "VRLY",
      createdAtUtc: "2026-07-26T12:00:00.000Z",
    };
    await fileSystem.ensureDirectory(input.backupRoot);
    await fileSystem.ensureDirectory(input.productionRoot);
    const staged = fileSystem.resolve("batches", input.batchId, "staged");
    await fileSystem.ensureDirectory(staged);
    stagedFile = fileSystem.resolve("batches", input.batchId, "staged", "nested", "image.tif");
    await fileSystem.ensureDirectory(
      fileSystem.resolve("batches", input.batchId, "staged", "nested"),
    );
    const body = Buffer.from("verified pixels");
    await fileSystem.writeStream(stagedFile, Readable.from(body));
    manifest = [
      {
        relativePath: "nested/image.tif",
        sizeBytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        stage: "STAGED",
      },
    ];
  });

  afterEach(async () => {
    await fileSystem.dispose();
  });

  it("publishes verified content and an authoritative marker to both roots", async () => {
    const backup = await publisher.writeBackup(input, manifest);
    const production = await publisher.copyProduction(input, manifest);

    expect(backup.artifacts).toEqual([
      expect.objectContaining({ relativePath: "nested/image.tif", stage: "BACKUP" }),
    ]);
    expect(production.artifacts).toEqual([
      expect.objectContaining({ relativePath: "nested/image.tif", stage: "PRODUCTION" }),
    ]);

    for (const root of [input.backupRoot, input.productionRoot]) {
      const markerPath = fileSystem.resolve(
        root === input.backupRoot ? "backup" : "production",
        input.clientFolder,
        input.orderFolder,
        ".cs-order.json",
      );
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as Record<string, unknown>;
      expect(marker).toEqual({
        orderId: input.orderId,
        orderCode: input.orderCode,
        clientCode: input.clientCode,
        createdAtUtc: input.createdAtUtc,
        schemaVersion: 1,
      });
    }
  });

  it("refuses to overwrite an existing non-empty destination", async () => {
    const destination = fileSystem.resolve(
      "backup",
      input.clientFolder,
      input.orderFolder,
      input.batchSubfolder,
    );
    await fileSystem.ensureDirectory(destination);
    await fileSystem.writeStream(
      fileSystem.resolve(
        "backup",
        input.clientFolder,
        input.orderFolder,
        input.batchSubfolder,
        "human-file.txt",
      ),
      Readable.from("do not overwrite"),
    );

    await expect(publisher.writeBackup(input, manifest)).rejects.toMatchObject({
      errorClass: "PERMANENT",
      message: expect.stringMatching(/refusing to overwrite/iu),
    });
    await expect(fileSystem.listFiles(destination)).resolves.toEqual([
      expect.objectContaining({ relativePath: "human-file.txt" }),
    ]);
  });

  it("resumes cleanly after a crash between backup and production", async () => {
    await publisher.writeBackup(input, manifest);

    const restarted = new TransferPublisher(fileSystem, new PortTreeCopyStrategy(fileSystem));
    await expect(restarted.copyProduction(input, manifest)).resolves.toMatchObject({
      artifacts: [expect.objectContaining({ stage: "PRODUCTION" })],
    });
    await expect(restarted.copyProduction(input, manifest)).resolves.toMatchObject({
      artifacts: [expect.objectContaining({ stage: "PRODUCTION" })],
    });
  });

  it("detects corruption at production verification and removes the unpublished copy", async () => {
    await publisher.writeBackup(input, manifest);
    class CorruptingCopy implements TreeCopyStrategy {
      async copy(source: string, destination: string): Promise<void> {
        await fileSystem.copyTree(source, destination);
        await fileSystem.writeStream(
          fileSystem.resolve(destination, "nested", "image.tif"),
          Readable.from("corrupted"),
          { overwrite: true },
        );
      }
    }
    const corruptingPublisher = new TransferPublisher(fileSystem, new CorruptingCopy());

    await expect(corruptingPublisher.copyProduction(input, manifest)).rejects.toMatchObject({
      errorClass: "PERMANENT",
      message: expect.stringMatching(/checksum|size/iu),
    });
    await expect(
      fileSystem.stat(
        fileSystem.resolve(
          "production",
          input.clientFolder,
          input.orderFolder,
          input.batchSubfolder,
        ),
      ),
    ).resolves.toBeNull();
    await expect(
      fileSystem.stat(
        fileSystem.resolve(
          "production",
          input.clientFolder,
          input.orderFolder,
          `.cs-transfer-${input.batchId}-production`,
        ),
      ),
    ).resolves.toBeNull();
    await expect(
      fileSystem.stat(fileSystem.resolve("production", ".cs-file-agent-transfers", input.batchId)),
    ).resolves.toBeNull();
  });

  it("sweeps abandoned share scratch outside the client tree on retry", async () => {
    const abandoned = fileSystem.resolve(
      "backup",
      ".cs-file-agent-transfers",
      input.batchId,
      "1-backup",
    );
    await fileSystem.ensureDirectory(abandoned);
    await fileSystem.writeStream(
      fileSystem.resolve(
        "backup",
        ".cs-file-agent-transfers",
        input.batchId,
        "1-backup",
        "partial.tif",
      ),
      Readable.from("partial"),
    );

    const retried = { ...input, attempt: 2 };
    await publisher.writeBackup(retried, manifest);

    await expect(
      fileSystem.stat(fileSystem.resolve("backup", ".cs-file-agent-transfers", input.batchId)),
    ).resolves.toBeNull();
    const orderFiles = await fileSystem.listFiles(
      fileSystem.resolve("backup", input.clientFolder, input.orderFolder),
    );
    expect(
      orderFiles.every(
        (file) =>
          !file.relativePath.includes("cs-transfer") && !file.relativePath.endsWith(".partial"),
      ),
    ).toBe(true);
  });

  it("reports non-zero progress before a production copy operation returns", async () => {
    await publisher.writeBackup(input, manifest);
    class DelayedCopy implements TreeCopyStrategy {
      async copy(source: string, destination: string): Promise<void> {
        await fileSystem.copyTree(source, destination);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    const delayedPublisher = new TransferPublisher(fileSystem, new DelayedCopy());
    const progress: Array<{ done: number; total: number }> = [];

    await delayedPublisher.copyProduction(input, manifest, async (done, total) => {
      progress.push({ done, total });
    });

    expect(progress[0]).toEqual({ done: 0, total: manifest[0]?.sizeBytes });
    expect(progress.some(({ done }) => done > 0)).toBe(true);
  });
});

describe("robocopy path compatibility", () => {
  it("uses normal UNC arguments because Windows robocopy rejects extended UNC syntax", () => {
    expect(toRobocopyPath("\\\\?\\UNC\\server\\share\\order")).toBe("\\\\server\\share\\order");
    expect(toRobocopyPath("\\\\server\\share\\order")).toBe("\\\\server\\share\\order");
    expect(() => toRobocopyPath("D:\\staging")).toThrow(/UNC path/iu);
  });
});
