import { mkdir, readdir } from "node:fs/promises";
import type { DbClient, PrismaClient } from "@cs/db";
import { joinUncPath, sanitisePathSegment, toExtendedLengthPath } from "@cs/shared";
import { recordAudit } from "@/lib/audit";

export type ClientIdentityInput = {
  kind: "ADDRESS" | "DOMAIN";
  value: string;
};

export type ClientMutationActor = {
  userId: string;
  label: string;
};

export type EnsureDirectory = (path: string) => Promise<void>;

export type CreateClientInput = {
  code: string;
  displayName: string;
  folderName?: string;
  backupRoot: string;
  productionRoot: string;
  identities?: readonly ClientIdentityInput[];
  actor: ClientMutationActor;
  correlationId: string;
  ensureDirectory?: EnsureDirectory;
};

export type DirectoryEntry = {
  name: string;
  isDirectory(): boolean;
};

export type ReadDirectory = (path: string) => Promise<readonly DirectoryEntry[]>;

function requiredTrimmed(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function normaliseClientCode(code: string): string {
  const normalised = requiredTrimmed(code, "Client code").toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/u.test(normalised)) {
    throw new Error("Client code must contain 2 to 12 ASCII letters or digits");
  }
  return normalised;
}

function normaliseIdentity(identity: ClientIdentityInput): ClientIdentityInput {
  const value = requiredTrimmed(identity.value, "Client identity").toLowerCase();
  if (identity.kind === "ADDRESS") {
    if (!/^[^@\s]+@[^@\s]+$/u.test(value)) {
      throw new Error("Address identity must be an email address");
    }
  } else if (!/^[^@\s.]+(?:\.[^@\s.]+)+$/u.test(value)) {
    throw new Error("Domain identity must be a domain name");
  }
  return { kind: identity.kind, value };
}

function validateFolderName(folderName: string): string {
  const trimmed = requiredTrimmed(folderName, "Client folder");
  if (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("\\") ||
    trimmed.includes("/") ||
    trimmed.toLowerCase() === "_final done"
  ) {
    throw new Error("Client folder must be a direct, non-reserved folder name");
  }
  return trimmed;
}

/**
 * Prefer the display name as a single share segment; sanitise or fall back to code when invalid.
 */
export function deriveClientFolderName(displayName: string, code: string): string {
  const normalisedCode = normaliseClientCode(code);
  const trimmedName = displayName.trim();
  try {
    return validateFolderName(trimmedName);
  } catch {
    try {
      return validateFolderName(sanitisePathSegment(trimmedName));
    } catch {
      return normalisedCode;
    }
  }
}

async function defaultEnsureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function ensureClientShareFolders(
  input: {
    backupRoot: string;
    productionRoot: string;
    folderName: string;
  },
  ensureDirectory: EnsureDirectory = defaultEnsureDirectory,
): Promise<void> {
  const folderName = validateFolderName(input.folderName);
  const backupPath = toExtendedLengthPath(joinUncPath(input.backupRoot, folderName));
  const productionPath = toExtendedLengthPath(joinUncPath(input.productionRoot, folderName));
  await ensureDirectory(backupPath);
  await ensureDirectory(productionPath);
}

export async function createClient(db: PrismaClient, input: CreateClientInput) {
  const code = normaliseClientCode(input.code);
  const displayName = requiredTrimmed(input.displayName, "Client display name");
  const folderName = validateFolderName(
    input.folderName && input.folderName.trim().length > 0
      ? input.folderName
      : deriveClientFolderName(displayName, code),
  );
  const identities = (input.identities ?? []).map(normaliseIdentity);
  const ensureDirectory = input.ensureDirectory ?? defaultEnsureDirectory;

  // Fail closed: create share folders before the DB row so a mkdir failure does not orphan a client.
  await ensureClientShareFolders(
    {
      backupRoot: input.backupRoot,
      productionRoot: input.productionRoot,
      folderName,
    },
    ensureDirectory,
  );

  return db.$transaction(async (transaction) => {
    const client = await transaction.client.create({
      data: {
        code,
        displayName,
        folderName,
        ...(identities.length > 0
          ? {
              identities: {
                create: identities.map((identity) => ({
                  kind: identity.kind,
                  value: identity.value,
                })),
              },
            }
          : {}),
      },
    });

    await recordAudit(transaction, {
      correlationId: input.correlationId,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      action: "client.created",
      entityType: "Client",
      entityId: client.id,
      metadata: { code, folderName },
    });

    return client;
  });
}

function parseSenderEmail(email: string): { address: string; domain: string } | null {
  const address = email.trim().toLowerCase();
  const match = /^[^@\s]+@([^@\s]+)$/u.exec(address);
  const domain = match?.[1];
  return domain ? { address, domain } : null;
}

async function findClientByIdentity(db: DbClient, kind: "ADDRESS" | "DOMAIN", value: string) {
  const identity = await db.clientIdentity.findFirst({
    where: {
      kind,
      value: { equals: value, mode: "insensitive" },
      client: { is: { isActive: true } },
    },
    select: { client: true },
  });
  return identity?.client ?? null;
}

export async function resolveClientByEmail(db: DbClient, email: string) {
  const sender = parseSenderEmail(email);
  if (!sender) return null;

  const exact = await findClientByIdentity(db, "ADDRESS", sender.address);
  if (exact) return exact;
  return findClientByIdentity(db, "DOMAIN", sender.domain);
}

async function readDirectory(path: string): Promise<readonly DirectoryEntry[]> {
  return readdir(path, { withFileTypes: true });
}

export async function listUnboundFolders(
  db: DbClient,
  backupRoot: string,
  readEntries: ReadDirectory = readDirectory,
): Promise<string[]> {
  const validatedRoot = joinUncPath(backupRoot);
  const entries = await readEntries(validatedRoot);
  const directoryNames = entries
    .filter((entry) => entry.isDirectory() && entry.name.trim().toLowerCase() !== "_final done")
    .map((entry) => entry.name);

  const boundClients = await db.client.findMany({
    select: { folderName: true },
  });
  const boundFolders = new Set(boundClients.map((client) => client.folderName.toLowerCase()));

  return directoryNames
    .filter((folderName) => !boundFolders.has(folderName.toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
}
