import { createReadStream, createWriteStream, type ReadStream } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readdir, rename, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PathTraversalError, toExtendedLengthPath } from "@cs/shared";

const EXTENDED_LOCAL_PREFIX = "\\\\?\\";
const UNC_PREFIX = "\\\\";
const DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:\\/u;

export type FileEntry = {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
};

export type FileStat = {
  isDirectory: boolean;
  isFile: boolean;
  sizeBytes: number;
  modifiedAt: Date;
};

export type WriteStreamOptions = {
  overwrite?: boolean;
};

export interface FileSystemPort {
  ensureDirectory(path: string): Promise<void>;
  writeStream(
    path: string,
    source: NodeJS.ReadableStream | ReadableStream<Uint8Array>,
    options?: WriteStreamOptions,
  ): Promise<void>;
  readStream(path: string): ReadStream;
  listFiles(path: string): Promise<readonly FileEntry[]>;
  stat(path: string): Promise<FileStat | null>;
  move(source: string, destination: string): Promise<void>;
  copyTree(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
  freeSpaceBytes(path: string): Promise<number>;
}

export function toFileSystemPath(path: string): string {
  const normalised = path.replace(/\//gu, "\\");
  if (normalised.startsWith(EXTENDED_LOCAL_PREFIX)) return normalised;
  if (normalised.startsWith(UNC_PREFIX)) return toExtendedLengthPath(normalised);
  if (DRIVE_ABSOLUTE_PATH.test(normalised)) return `${EXTENDED_LOCAL_PREFIX}${normalised}`;
  return path;
}

function nativePath(path: string): string {
  return process.platform === "win32" ? toFileSystemPath(path) : path;
}

function canonicalRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function toNodeReadable(
  source: NodeJS.ReadableStream | ReadableStream<Uint8Array>,
): NodeJS.ReadableStream {
  return source instanceof ReadableStream ? Readable.fromWeb(source) : source;
}

export class NodeFileSystem implements FileSystemPort {
  async ensureDirectory(path: string): Promise<void> {
    await mkdir(nativePath(path), { recursive: true });
  }

  async writeStream(
    path: string,
    source: NodeJS.ReadableStream | ReadableStream<Uint8Array>,
    options: WriteStreamOptions = {},
  ): Promise<void> {
    const target = nativePath(path);
    await pipeline(
      toNodeReadable(source),
      createWriteStream(target, { flags: options.overwrite === true ? "w" : "wx" }),
    );
  }

  readStream(path: string): ReadStream {
    return createReadStream(nativePath(path));
  }

  async listFiles(path: string): Promise<readonly FileEntry[]> {
    const root = nativePath(path);
    const output: FileEntry[] = [];

    const visit = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const absolutePath = join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          throw new PathTraversalError(entry.name);
        }
        if (entry.isDirectory()) {
          await visit(absolutePath);
          continue;
        }
        if (!entry.isFile()) continue;
        const details = await stat(absolutePath);
        output.push({
          absolutePath,
          relativePath: canonicalRelativePath(relative(root, absolutePath)),
          sizeBytes: details.size,
        });
      }
    };

    await visit(root);
    return output;
  }

  async stat(path: string): Promise<FileStat | null> {
    try {
      const details = await lstat(nativePath(path));
      if (details.isSymbolicLink()) {
        throw new PathTraversalError(path);
      }
      return {
        isDirectory: details.isDirectory(),
        isFile: details.isFile(),
        sizeBytes: details.size,
        modifiedAt: details.mtime,
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  }

  async move(source: string, destination: string): Promise<void> {
    await rename(nativePath(source), nativePath(destination));
  }

  async copyTree(source: string, destination: string): Promise<void> {
    await cp(nativePath(source), nativePath(destination), {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
  }

  async remove(path: string): Promise<void> {
    await rm(nativePath(path), { recursive: true, force: true });
  }

  async freeSpaceBytes(path: string): Promise<number> {
    const details = await statfs(nativePath(path), { bigint: true });
    const available = details.bavail * details.bsize;
    if (available > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Number(available);
  }
}

export class TempDirectoryFileSystem extends NodeFileSystem {
  readonly root: string;

  private constructor(root: string) {
    super();
    this.root = root;
  }

  static async create(prefix: string = "cs-file-agent-"): Promise<TempDirectoryFileSystem> {
    const root = await mkdtemp(join(tmpdir(), prefix));
    return new TempDirectoryFileSystem(root);
  }

  resolve(...segments: readonly string[]): string {
    const target = resolve(this.root, ...segments);
    const relativeTarget = relative(this.root, target);
    if (
      relativeTarget === ".." ||
      relativeTarget.startsWith(`..${sep}`) ||
      isAbsolute(relativeTarget)
    ) {
      throw new PathTraversalError(segments.join(sep));
    }
    return target;
  }

  async dispose(): Promise<void> {
    await this.remove(this.root);
  }
}

export function fileName(path: string): string {
  return basename(path);
}

export function parentDirectory(path: string): string {
  return dirname(path);
}
