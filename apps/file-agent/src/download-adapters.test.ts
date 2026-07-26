import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DropboxPublicAdapter,
  GoogleDriveAdapter,
  ManualDropAdapter,
} from "./download-adapters.js";
import { TempDirectoryFileSystem } from "./filesystem.js";
import { TransferFailure } from "./transfer-errors.js";

describe("download adapters", () => {
  let fileSystem: TempDirectoryFileSystem;
  let server: Server | undefined;

  beforeEach(async () => {
    fileSystem = await TempDirectoryFileSystem.create();
  });

  afterEach(async () => {
    if (server) {
      server.close();
      await once(server, "close");
      server = undefined;
    }
    await fileSystem.dispose();
  });

  async function fakeServer(
    handler: Parameters<typeof createServer>[0],
  ): Promise<{ baseUrl: string }> {
    server = createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no TCP address");
    return { baseUrl: `http://127.0.0.1:${address.port}` };
  }

  it("rewrites a public Dropbox URL to dl=1 and streams it to staging", async () => {
    const { baseUrl } = await fakeServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": "7",
        "content-disposition": 'attachment; filename="order.zip"',
      });
      response.end("archive");
    });
    let requestedUrl: string | undefined;
    const adapter = new DropboxPublicAdapter(fileSystem, async (input, init) => {
      requestedUrl = String(input);
      return fetch(baseUrl, init);
    });

    const result = await adapter.download({
      batchId: "batch-1",
      stagingRoot: fileSystem.root,
      sourceUrl: "https://www.dropbox.com/s/example/order.zip?dl=0",
      manualDropConfirmed: false,
    });

    expect(new URL(requestedUrl ?? "").searchParams.get("dl")).toBe("1");
    expect(result.bytesTotal).toBe(7);
    expect(result.files).toEqual([
      expect.objectContaining({ relativePath: "order.zip", sizeBytes: 7 }),
    ]);
  });

  it("classifies an HTML login body as permanent and does not save it", async () => {
    const { baseUrl } = await fakeServer((_request, response) => {
      const body = "<!doctype html><html><body>Sign in</body></html>";
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": String(Buffer.byteLength(body)),
      });
      response.end(body);
    });
    const adapter = new DropboxPublicAdapter(fileSystem, async (_input, init) =>
      fetch(baseUrl, init),
    );

    const failure = await adapter
      .download({
        batchId: "batch-2",
        stagingRoot: fileSystem.root,
        sourceUrl: "https://dropbox.com/s/example/private.zip?dl=0",
        manualDropConfirmed: false,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TransferFailure);
    expect(failure).toMatchObject({ errorClass: "PERMANENT" });
    await expect(
      fileSystem.listFiles(fileSystem.resolve("batches", "batch-2", "download")),
    ).resolves.toEqual([]);
  });

  it("classifies a truncated response as transient and removes the partial file", async () => {
    const { baseUrl } = await fakeServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": "10",
        "content-disposition": 'attachment; filename="truncated.zip"',
      });
      response.write("abc");
      response.destroy();
    });
    const adapter = new DropboxPublicAdapter(fileSystem, async (_input, init) =>
      fetch(baseUrl, init),
    );

    const failure = await adapter
      .download({
        batchId: "batch-3",
        stagingRoot: fileSystem.root,
        sourceUrl: "https://dropbox.com/s/example/truncated.zip?dl=0",
        manualDropConfirmed: false,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TransferFailure);
    expect(failure).toMatchObject({ errorClass: "TRANSIENT" });
    await expect(
      fileSystem.listFiles(fileSystem.resolve("batches", "batch-3", "download")),
    ).resolves.toEqual([]);
  });

  it("requires operator confirmation before copying a manual drop", async () => {
    const adapter = new ManualDropAdapter(fileSystem);
    const manual = fileSystem.resolve("manual", "batch-4");
    await fileSystem.ensureDirectory(manual);
    await fileSystem.writeStream(
      fileSystem.resolve("manual", "batch-4", "image.tif"),
      Readable.from("pixels"),
    );

    await expect(
      adapter.download({
        batchId: "batch-4",
        stagingRoot: fileSystem.root,
        manualDropConfirmed: false,
      }),
    ).rejects.toMatchObject({ errorClass: "PERMANENT" });

    await expect(
      adapter.download({
        batchId: "batch-4",
        stagingRoot: fileSystem.root,
        manualDropConfirmed: true,
      }),
    ).resolves.toMatchObject({
      bytesTotal: 6,
      files: [expect.objectContaining({ relativePath: "image.tif" })],
    });
  });

  it("removes an abandoned partial manual copy before retrying", async () => {
    const adapter = new ManualDropAdapter(fileSystem);
    await fileSystem.ensureDirectory(fileSystem.resolve("manual", "batch-retry"));
    await fileSystem.writeStream(
      fileSystem.resolve("manual", "batch-retry", "complete.tif"),
      Readable.from("complete"),
    );
    await fileSystem.ensureDirectory(
      fileSystem.resolve("batches", "batch-retry", "download.partial"),
    );
    await fileSystem.writeStream(
      fileSystem.resolve("batches", "batch-retry", "download.partial", "truncated.tif"),
      Readable.from("x"),
    );

    const result = await adapter.download({
      batchId: "batch-retry",
      stagingRoot: fileSystem.root,
      manualDropConfirmed: true,
    });

    expect(result.files).toEqual([
      expect.objectContaining({ relativePath: "complete.tif", sizeBytes: 8 }),
    ]);
    await expect(
      fileSystem.stat(fileSystem.resolve("batches", "batch-retry", "download.partial")),
    ).resolves.toBeNull();
  });

  it("permanently directs Google Drive sources to manual drop without credentials", async () => {
    const adapter = new GoogleDriveAdapter();
    await expect(
      adapter.download({
        batchId: "batch-5",
        stagingRoot: fileSystem.root,
        sourceUrl: "https://drive.google.com/file/d/private/view",
        manualDropConfirmed: false,
      }),
    ).rejects.toMatchObject({
      errorClass: "PERMANENT",
      message: expect.stringMatching(/manual drop/iu),
    });
  });
});
