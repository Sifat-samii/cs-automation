const CODE_MIN = 2;
const CODE_MAX = 12;

/**
 * Derive a client code from a display name: uppercase A–Z/0–9 only, length 2–12.
 * Prefer concatenated word characters; if empty after strip, fall back to "CLIENT".
 */
export function deriveClientCode(displayName: string): string {
  const words = displayName
    .trim()
    .split(/[^A-Za-z0-9]+/u)
    .filter((part) => part.length > 0);
  let compact = words
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "");
  if (compact.length === 0) {
    compact = "CLIENT";
  }
  if (compact.length < CODE_MIN) {
    compact = (compact + "CLIENT").slice(0, CODE_MIN);
  }
  return compact.slice(0, CODE_MAX);
}

/**
 * Return `base` if unused; otherwise append 2, 3, … keeping total length ≤ 12.
 */
export function allocateUniqueClientCode(base: string, existingCodes: ReadonlySet<string>): string {
  const normalised = base
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "")
    .slice(0, CODE_MAX);
  const seed =
    normalised.length >= CODE_MIN ? normalised : deriveClientCode(normalised || "CLIENT");
  if (!existingCodes.has(seed)) {
    return seed;
  }
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const suffixText = String(suffix);
    const prefixLen = Math.max(CODE_MIN, Math.min(CODE_MAX - suffixText.length, seed.length));
    const candidate = `${seed.slice(0, prefixLen)}${suffixText}`;
    if (
      candidate.length >= CODE_MIN &&
      candidate.length <= CODE_MAX &&
      !existingCodes.has(candidate)
    ) {
      return candidate;
    }
  }
  throw new Error(`Unable to allocate a unique client code for base ${base}`);
}
