import type { PrismaClient } from "@prisma/client";
import { allocateUniqueClientCode, deriveClientCode } from "@cs/shared";

/** Phase 5 Wave A display names — seed only; no identities. */
export const PHASE5_CLIENT_DISPLAY_NAMES: readonly string[] = [
  "Affordable Golf",
  "Amsale",
  "BG",
  "BH",
  "Blink Imaging",
  "Box Photographic",
  "BR",
  "Bradfords",
  "CBI",
  "Celtic",
  "Chris C",
  "Corporate Spec",
  "David Burrow",
  "David Burr",
  "DGPB",
  "Dhgf",
  "DUW",
  "Fashion Pass",
  "FN",
  "Fox R",
  "Free Fly",
  "FSA",
  "Game Day",
  "Gustav",
  "Harbinger",
  "HBLK",
  "HN",
  "HW",
  "JC",
  "JGleasure",
  "Laings",
  "Legendary",
  "Meshki",
  "MGG",
  "Mustad",
  "NBU",
  "Ohpolly",
  "Proper Cloth",
  "R&C",
  "Revelry",
  "SHH",
  "Silk Lavandaria",
  "SJC & JAG",
  "Spectrum",
  "Sue Todd",
  "Tefron",
  "TL",
  "TM",
  "TYC",
  "TYR",
  "Untamed",
  "Veronica",
  "Vrly",
  "Yeti",
  "Yummie",
];

export async function seedClients(
  prisma: PrismaClient,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  const existing = await prisma.client.findMany({
    select: { code: true, displayName: true, folderName: true },
  });
  const codes = new Set(existing.map((row) => row.code.toUpperCase()));
  const names = new Set(existing.map((row) => row.displayName.trim().toLowerCase()));
  const folders = new Set(existing.map((row) => row.folderName.toLowerCase()));

  for (const displayName of PHASE5_CLIENT_DISPLAY_NAMES) {
    const normalisedName = displayName.trim().toLowerCase();
    if (names.has(normalisedName)) {
      skipped += 1;
      continue;
    }

    const base = deriveClientCode(displayName);
    const code = allocateUniqueClientCode(base, codes);
    let folderName = code;
    let folderSuffix = 2;
    while (folders.has(folderName.toLowerCase())) {
      const suffix = String(folderSuffix);
      folderName = `${code.slice(0, Math.max(2, 12 - suffix.length))}${suffix}`;
      folderSuffix += 1;
    }

    await prisma.client.create({
      data: {
        code,
        displayName: displayName.trim(),
        folderName,
      },
    });
    codes.add(code);
    names.add(normalisedName);
    folders.add(folderName.toLowerCase());
    created += 1;
  }

  return { created, skipped };
}
