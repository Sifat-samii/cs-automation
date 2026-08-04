const WINDOWS_ILLEGAL_CHARACTERS = /[<>:"/\\|?*]/gu;
const WINDOWS_RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const ORDER_CODE = /^[A-Z0-9]{2,12}_\d{6}_\d{3}$/u;
const NORMAL_UNC_PREFIX = "\\\\";
const EXTENDED_UNC_PREFIX = "\\\\?\\UNC\\";
const MAX_PATH = 260;

export class PathTraversalError extends Error {
  constructor(segment: string) {
    super(`Path segment would escape its root: ${JSON.stringify(segment)}`);
    this.name = "PathTraversalError";
  }
}

export class PathBudgetError extends Error {
  readonly total: number;
  readonly maximum: number;

  constructor(total: number, maximum: number = MAX_PATH) {
    super(`Path length ${total} exceeds the ${maximum}-character path budget`);
    this.name = "PathBudgetError";
    this.total = total;
    this.maximum = maximum;
  }
}

function assertNotTraversal(value: string): void {
  if (value === "." || value === "..") {
    throw new PathTraversalError(value);
  }
}

export function sanitisePathSegment(input: string): string {
  const withoutControlCharacters = Array.from(input)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint > 31 && codePoint !== 127;
    })
    .join("");
  const withoutIllegalCharacters = withoutControlCharacters.replace(WINDOWS_ILLEGAL_CHARACTERS, "");
  const whitespaceCollapsed = withoutIllegalCharacters.trim().replace(/\s+/gu, "_");
  const sanitised = whitespaceCollapsed.replace(/^_+|[_.\s]+$/gu, "");

  assertNotTraversal(withoutIllegalCharacters.trim());
  assertNotTraversal(sanitised);

  if (sanitised.length === 0) {
    return "untitled";
  }

  if (WINDOWS_RESERVED_NAME.test(sanitised)) {
    throw new Error(`Path segment uses a reserved Windows device name: ${sanitised}`);
  }

  return sanitised;
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

export function buildOrderCode(clientCode: string, date: Date, sequence: number): string {
  const normalisedClientCode = clientCode.toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/u.test(normalisedClientCode)) {
    throw new Error("Client code must contain 2 to 12 ASCII letters or digits");
  }
  if (Number.isNaN(date.getTime())) {
    throw new Error("Order date must be valid");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error("Order sequence must be an integer from 1 to 999");
  }

  const year = twoDigits(date.getUTCFullYear() % 100);
  const month = twoDigits(date.getUTCMonth() + 1);
  const day = twoDigits(date.getUTCDate());
  return `${normalisedClientCode}_${year}${month}${day}_${sequence.toString().padStart(3, "0")}`;
}

export function buildOrderFolderName(
  orderCode: string,
  title: string,
  maximumLength: number = 120,
): string {
  if (!ORDER_CODE.test(orderCode)) {
    throw new Error("Order code must use the canonical CLIENTCODE_YYMMDD_NNN format");
  }

  const prefix = `${orderCode}__`;
  const availableSuffixLength = maximumLength - prefix.length;
  if (availableSuffixLength < 1) {
    throw new PathBudgetError(prefix.length + 1, maximumLength);
  }

  const sanitisedTitle = sanitisePathSegment(title).toLowerCase();
  let suffix = sanitisedTitle.slice(0, availableSuffixLength);

  if (sanitisedTitle.length > availableSuffixLength && suffix.includes("_")) {
    const finalWordBoundary = suffix.lastIndexOf("_");
    if (finalWordBoundary > 0) {
      suffix = suffix.slice(0, finalWordBoundary);
    }
  }

  suffix = suffix.replace(/_+$/u, "");
  return `${prefix}${suffix || "untitled"}`;
}

function isUncPath(value: string): boolean {
  return value.startsWith(NORMAL_UNC_PREFIX) && !value.startsWith("\\\\?\\");
}

function isExtendedUncPath(value: string): boolean {
  return value.startsWith(EXTENDED_UNC_PREFIX);
}

function validateUncRoot(root: string): string {
  const normalisedRoot = root.replace(/\//gu, "\\").replace(/\\+$/u, "");
  if (!isUncPath(normalisedRoot) && !isExtendedUncPath(normalisedRoot)) {
    throw new Error("Path root must be a UNC path");
  }
  return normalisedRoot;
}

function validateRelativeSegment(segment: string): string[] {
  if (
    segment.length === 0 ||
    segment.startsWith("\\") ||
    segment.startsWith("/") ||
    /^[A-Za-z]:/u.test(segment)
  ) {
    throw new PathTraversalError(segment);
  }

  const parts = segment.replace(/\//gu, "\\").split("\\");
  for (const part of parts) {
    if (part.length === 0 || part === "." || part === "..") {
      throw new PathTraversalError(segment);
    }
  }
  return parts;
}

export function joinUncPath(root: string, ...segments: readonly string[]): string {
  const normalisedRoot = validateUncRoot(root);
  const validatedParts = segments.flatMap(validateRelativeSegment);
  return validatedParts.length === 0
    ? normalisedRoot
    : `${normalisedRoot}\\${validatedParts.join("\\")}`;
}

export function toExtendedLengthPath(path: string): string {
  const normalisedPath = path.replace(/\//gu, "\\");
  if (isExtendedUncPath(normalisedPath)) {
    return normalisedPath;
  }
  if (!isUncPath(normalisedPath)) {
    throw new Error("Only UNC paths can be converted to extended-length form");
  }
  return `${EXTENDED_UNC_PREFIX}${normalisedPath.slice(NORMAL_UNC_PREFIX.length)}`;
}

function toNormalUncPath(path: string): string {
  return isExtendedUncPath(path)
    ? `${NORMAL_UNC_PREFIX}${path.slice(EXTENDED_UNC_PREFIX.length)}`
    : path;
}

export function assertPathBudget(
  root: string,
  segments: readonly string[],
  longestExpectedFileName: string,
  maximum: number = MAX_PATH,
): number {
  const fullPath = toNormalUncPath(joinUncPath(root, ...segments, longestExpectedFileName));
  const total = fullPath.length;
  if (total > maximum) {
    throw new PathBudgetError(total, maximum);
  }
  return total;
}
