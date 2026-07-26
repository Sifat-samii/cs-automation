import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeFileSystem, TempDirectoryFileSystem, toFileSystemPath } from "./filesystem.js";

describe("filesystem path conversion", () => {
  it("converts UNC paths to extended-length UNC paths", () => {
    expect(toFileSystemPath("\\\\server\\share\\order\\file.tif")).toBe(
      "\\\\?\\UNC\\server\\share\\order\\file.tif",
    );
  });

  it("converts local Windows paths and is idempotent", () => {
    const extended = toFileSystemPath("D:\\cs-staging\\batch");
    expect(extended).toBe("\\\\?\\D:\\cs-staging\\batch");
    expect(toFileSystemPath(extended)).toBe(extended);
  });
});

describe("TempDirectoryFileSystem", () => {
  let fileSystem: TempDirectoryFileSystem;

  beforeEach(async () => {
    fileSystem = await TempDirectoryFileSystem.create();
  });

  afterEach(async () => {
    await fileSystem.dispose();
  });

  it("writes, reads, stats, and recursively lists files", async () => {
    const source = fileSystem.resolve("source");
    await fileSystem.ensureDirectory(fileSystem.resolve("source", "nested"));
    await fileSystem.writeStream(
      fileSystem.resolve("source", "nested", "image.tif"),
      Readable.from(Buffer.from("pixels")),
    );

    await expect(fileSystem.stat(source)).resolves.toMatchObject({ isDirectory: true });
    await expect(fileSystem.listFiles(source)).resolves.toEqual([
      expect.objectContaining({
        relativePath: "nested/image.tif",
        sizeBytes: 6,
      }),
    ]);
  });

  it("refuses to overwrite a stream target by default", async () => {
    const target = fileSystem.resolve("file.bin");
    await fileSystem.writeStream(target, Readable.from("first"));

    await expect(fileSystem.writeStream(target, Readable.from("second"))).rejects.toMatchObject({
      code: "EEXIST",
    });
  });

  it("moves and copies directory trees without overwriting", async () => {
    const source = fileSystem.resolve("source");
    const copied = fileSystem.resolve("copied");
    const moved = fileSystem.resolve("moved");
    await fileSystem.ensureDirectory(source);
    await fileSystem.writeStream(fileSystem.resolve("source", "one.txt"), Readable.from("one"));

    await fileSystem.copyTree(source, copied);
    await fileSystem.move(copied, moved);

    await expect(fileSystem.listFiles(moved)).resolves.toEqual([
      expect.objectContaining({ relativePath: "one.txt", sizeBytes: 3 }),
    ]);
    await expect(fileSystem.stat(copied)).resolves.toBeNull();
    await expect(fileSystem.copyTree(source, moved)).rejects.toBeTruthy();
  });

  it("reports free space and confines resolved paths to the temp root", async () => {
    await expect(fileSystem.freeSpaceBytes(fileSystem.root)).resolves.toBeGreaterThan(0);
    expect(() => fileSystem.resolve("..", "escape")).toThrow(/escape/u);
  });

  it("exposes the same behavior through the real implementation", async () => {
    const real: NodeFileSystem = fileSystem;
    await real.ensureDirectory(fileSystem.resolve("real"));
    await expect(real.stat(fileSystem.resolve("real"))).resolves.toMatchObject({
      isDirectory: true,
    });
  });
});
