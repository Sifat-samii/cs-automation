import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { crc32 } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TempDirectoryFileSystem } from "./filesystem.js";
import { StagingVerifier, type StagingVerificationInput } from "./staging.js";

const backupRoot =
  "\\\\192.168.0.15\\Production\\File Transfer Server\\Sifat_Project Coordinator\\Software test\\_Software Test";
const productionRoot =
  "\\\\192.168.0.15\\Production\\File Server\\_Share Work\\2026\\_Software Test";

type ZipEntry = {
  name: string;
  body: Buffer;
  crcOverride?: number;
};

function storedZip(entries: readonly ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = entry.crcOverride ?? crc32(entry.body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.body.length, 18);
    local.writeUInt32LE(entry.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.body.length, 20);
    central.writeUInt32LE(entry.body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);

    localOffset += local.length + name.length + entry.body.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

describe("staging verification", () => {
  let fileSystem: TempDirectoryFileSystem;
  let verifier: StagingVerifier;
  let input: StagingVerificationInput;

  beforeEach(async () => {
    fileSystem = await TempDirectoryFileSystem.create();
    verifier = new StagingVerifier(fileSystem);
    input = {
      batchId: "batch-1",
      stagingRoot: fileSystem.root,
      backupRoot,
      productionRoot,
      clientFolder: "Verily",
      orderFolder: "VRLY_260726_001__spring_drop",
      batchSubfolder: "01_INITIAL",
    };
    await fileSystem.ensureDirectory(fileSystem.resolve("batches", "batch-1", "download"));
  });

  afterEach(async () => {
    await fileSystem.dispose();
  });

  it("rejects zero-byte content before it reaches either share", async () => {
    await fileSystem.writeStream(
      fileSystem.resolve("batches", "batch-1", "download", "empty.tif"),
      Readable.from(Buffer.alloc(0)),
    );

    await expect(verifier.verify(input)).rejects.toMatchObject({
      errorClass: "PERMANENT",
      message: expect.stringMatching(/zero-byte/iu),
    });
  });

  it("copies regular files and builds a SHA-256 manifest", async () => {
    const body = Buffer.from("image pixels");
    await fileSystem.writeStream(
      fileSystem.resolve("batches", "batch-1", "download", "image.tif"),
      Readable.from(body),
    );

    await expect(verifier.verify(input)).resolves.toEqual({
      directory: fileSystem.resolve("batches", "batch-1", "staged"),
      bytesTotal: body.length,
      artifacts: [
        {
          relativePath: "image.tif",
          sizeBytes: body.length,
          sha256: createHash("sha256").update(body).digest("hex"),
          stage: "STAGED",
        },
      ],
    });
  });

  it("validates and expands a ZIP archive without retaining the archive", async () => {
    const body = Buffer.from("expanded pixels");
    const archive = storedZip([{ name: "nested/image.tif", body }]);
    await fileSystem.writeStream(
      fileSystem.resolve("batches", "batch-1", "download", "order.zip"),
      Readable.from(archive),
    );

    const result = await verifier.verify(input);

    expect(result.artifacts).toEqual([
      {
        relativePath: "nested/image.tif",
        sizeBytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        stage: "STAGED",
      },
    ]);
    expect(result.artifacts.some((artifact) => artifact.relativePath.endsWith(".zip"))).toBe(false);
  });

  it("rejects a ZIP entry whose CRC does not match its content", async () => {
    const archive = storedZip([
      { name: "image.tif", body: Buffer.from("corrupt me"), crcOverride: 1 },
    ]);
    await fileSystem.writeStream(
      fileSystem.resolve("batches", "batch-1", "download", "corrupt.zip"),
      Readable.from(archive),
    );

    await expect(verifier.verify(input)).rejects.toMatchObject({
      errorClass: "PERMANENT",
      message: expect.stringMatching(/integrity|corrupt/iu),
    });
    await expect(
      fileSystem.stat(fileSystem.resolve("batches", "batch-1", "staged")),
    ).resolves.toBeNull();
  });

  it("rejects a deliberately deep archive before writing an over-budget path", async () => {
    const deepName = `${Array.from({ length: 18 }, () => "nested_folder").join("/")}/image.tif`;
    const archive = storedZip([{ name: deepName, body: Buffer.from("pixels") }]);
    await fileSystem.writeStream(
      fileSystem.resolve("batches", "batch-1", "download", "deep.zip"),
      Readable.from(archive),
    );

    await expect(verifier.verify(input)).rejects.toMatchObject({
      errorClass: "PERMANENT",
      message: expect.stringMatching(/path length/iu),
    });
    await expect(
      fileSystem.stat(fileSystem.resolve("batches", "batch-1", "staged")),
    ).resolves.toBeNull();
  });
});
