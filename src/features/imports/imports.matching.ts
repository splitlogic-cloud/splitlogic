import "server-only";

export { matchImportRowsForImport, normalizeIsrc } from "@/features/matching/match-import-rows";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readRawIsrc(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;

  const candidates = [
    raw["isrc"],
    raw["ISRC"],
    raw["isrc_code"],
    raw["track_isrc"],
    raw["trackISRC"],
    raw["product_isrc"],
    raw["productISRC"],
  ];

  for (const value of candidates) {
    const parsed = readString(value);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}