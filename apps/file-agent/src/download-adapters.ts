import { basename, join } from "node:path";
import { sanitisePathSegment } from "@cs/shared";
import type { FileEntry, FileSystemPort } from "./filesystem.js";
import {
  asTransferFailure,
  PermanentTransferFailure,
  TransferFailure,
  TransientTransferFailure,
} from "./transfer-errors.js";

const HTML_PEEK_BYTES = 1_024;

export type DownloadInput = {
  batchId: string;
  stagingRoot: string;
  sourceUrl?: string;
  manualDropConfirmed: boolean;
};

export type DownloadResult = {
  directory: string;
  files: readonly FileEntry[];
  bytesTotal: number;
};

export interface DownloadAdapter {
  download(input: DownloadInput): Promise<DownloadResult>;
}

function batchDownloadDirectory(stagingRoot: string, batchId: string): string {
  return join(stagingRoot, "batches", batchId, "download");
}

function parseContentLength(value: string | null): number | null {
  if (value === null) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 ? length : null;
}

function responseFileName(response: Response, url: URL, batchId: string): string {
  const disposition = response.headers.get("content-disposition");
  const encodedMatch = disposition?.match(/filename\*=UTF-8''([^;]+)/iu);
  const plainMatch = disposition?.match(/filename="?([^";]+)"?/iu);
  let candidate = encodedMatch?.[1] ?? plainMatch?.[1];
  if (candidate) {
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      candidate = undefined;
    }
  }
  candidate ??= basename(url.pathname);
  if (!candidate || candidate === "/" || candidate === ".") {
    candidate = `${batchId}.download`;
  }
  return sanitisePathSegment(candidate);
}

function isHtmlPrefix(chunks: readonly Uint8Array[]): boolean {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const prefix = new TextDecoder().decode(combined.slice(0, HTML_PEEK_BYTES)).trimStart();
  return /^<!doctype\s+html|^<html(?:\s|>)/iu.test(prefix);
}

async function peekBody(
  body: ReadableStream<Uint8Array>,
): Promise<{ stream: ReadableStream<Uint8Array>; looksLikeHtml: boolean }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let ended = false;
  while (bytes < HTML_PEEK_BYTES) {
    const result = await reader.read();
    if (result.done) {
      ended = true;
      break;
    }
    chunks.push(result.value);
    bytes += result.value.byteLength;
  }

  return {
    looksLikeHtml: isHtmlPrefix(chunks),
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        if (ended) controller.close();
      },
      async pull(controller) {
        if (ended) return;
        try {
          const result = await reader.read();
          if (result.done) {
            ended = true;
            controller.close();
          } else {
            controller.enqueue(result.value);
          }
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    }),
  };
}

function httpFailure(response: Response): TransferFailure {
  const message = `Dropbox download failed with HTTP ${response.status}`;
  return response.status === 408 || response.status === 429 || response.status >= 500
    ? new TransientTransferFailure(message)
    : new PermanentTransferFailure(`${message}; use manual drop`);
}

export class DropboxPublicAdapter implements DownloadAdapter {
  private readonly fileSystem: FileSystemPort;
  private readonly fetcher: typeof fetch;

  constructor(fileSystem: FileSystemPort, fetcher: typeof fetch = fetch) {
    this.fileSystem = fileSystem;
    this.fetcher = fetcher;
  }

  async download(input: DownloadInput): Promise<DownloadResult> {
    if (!input.sourceUrl) {
      throw new PermanentTransferFailure("Dropbox source URL is missing; use manual drop");
    }

    let source: URL;
    try {
      source = new URL(input.sourceUrl);
    } catch {
      throw new PermanentTransferFailure("Dropbox source URL is invalid; use manual drop");
    }
    if (source.protocol !== "https:" || !/(?:^|\.)dropbox\.com$/iu.test(source.hostname)) {
      throw new PermanentTransferFailure("Only public HTTPS Dropbox links are supported");
    }
    source.searchParams.set("dl", "1");

    const directory = batchDownloadDirectory(input.stagingRoot, input.batchId);
    await this.fileSystem.ensureDirectory(directory);

    let response: Response;
    try {
      response = await this.fetcher(source, { redirect: "follow" });
    } catch (error) {
      throw asTransferFailure(error, "Dropbox request failed");
    }
    if (!response.ok) throw httpFailure(response);
    if (!response.body) {
      throw new TransientTransferFailure("Dropbox response did not contain a body");
    }

    let peeked: Awaited<ReturnType<typeof peekBody>>;
    try {
      peeked = await peekBody(response.body);
    } catch (error) {
      throw asTransferFailure(error, "Dropbox response ended before download started");
    }
    if (
      response.headers.get("content-type")?.toLowerCase().includes("text/html") ||
      peeked.looksLikeHtml
    ) {
      await peeked.stream.cancel();
      throw new PermanentTransferFailure(
        "Dropbox returned an HTML login page; provide a public link or use manual drop",
      );
    }

    const fileName = responseFileName(response, source, input.batchId);
    const target = join(directory, fileName);
    const partial = `${target}.partial`;
    const existing = await this.fileSystem.stat(target);
    if (existing?.isFile && existing.sizeBytes > 0) {
      return {
        directory,
        files: await this.fileSystem.listFiles(directory),
        bytesTotal: existing.sizeBytes,
      };
    }
    await this.fileSystem.remove(partial);
    if (existing) await this.fileSystem.remove(target);

    const expectedBytes = parseContentLength(response.headers.get("content-length"));
    let receivedBytes = 0;
    const counted = peeked.stream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          receivedBytes += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    );

    try {
      await this.fileSystem.writeStream(partial, counted);
      if (expectedBytes !== null && receivedBytes !== expectedBytes) {
        throw new TransientTransferFailure(
          `Dropbox response was truncated: expected ${expectedBytes} bytes, received ${receivedBytes}`,
        );
      }
      await this.fileSystem.move(partial, target);
    } catch (error) {
      await this.fileSystem.remove(partial);
      throw asTransferFailure(error, "Dropbox stream failed");
    }

    return {
      directory,
      files: await this.fileSystem.listFiles(directory),
      bytesTotal: receivedBytes,
    };
  }
}

export class GoogleDriveAdapter implements DownloadAdapter {
  async download(_input: DownloadInput): Promise<DownloadResult> {
    throw new PermanentTransferFailure(
      "Authenticated Google Drive download is not configured; operator must use manual drop",
    );
  }
}

export class ManualDropAdapter implements DownloadAdapter {
  private readonly fileSystem: FileSystemPort;

  constructor(fileSystem: FileSystemPort) {
    this.fileSystem = fileSystem;
  }

  async download(input: DownloadInput): Promise<DownloadResult> {
    if (!input.manualDropConfirmed) {
      throw new PermanentTransferFailure(
        "Manual drop must be confirmed by an operator before the agent can read it",
      );
    }

    const source = join(input.stagingRoot, "manual", input.batchId);
    const sourceFiles = await this.fileSystem.listFiles(source).catch((error: unknown) => {
      throw new PermanentTransferFailure(
        `Manual drop folder is unavailable for batch ${input.batchId}`,
        { cause: error },
      );
    });
    if (sourceFiles.length === 0) {
      throw new PermanentTransferFailure(
        `Manual drop folder for batch ${input.batchId} contains no files`,
      );
    }

    const directory = batchDownloadDirectory(input.stagingRoot, input.batchId);
    const partial = `${directory}.partial`;
    const existing = await this.fileSystem.stat(directory);
    if (existing) {
      const existingFiles = await this.fileSystem.listFiles(directory);
      if (existingFiles.length > 0) {
        return {
          directory,
          files: existingFiles,
          bytesTotal: existingFiles.reduce((total, file) => total + file.sizeBytes, 0),
        };
      }
      await this.fileSystem.remove(directory);
    }

    await this.fileSystem.remove(partial);
    try {
      await this.fileSystem.copyTree(source, partial);
      await this.fileSystem.move(partial, directory);
    } catch (error) {
      await this.fileSystem.remove(partial);
      throw asTransferFailure(error, "Manual drop copy failed");
    }
    const files = await this.fileSystem.listFiles(directory);
    return {
      directory,
      files,
      bytesTotal: files.reduce((total, file) => total + file.sizeBytes, 0),
    };
  }
}
