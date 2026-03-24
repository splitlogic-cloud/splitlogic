import "server-only";

export {
  matchImportRowsForImport,
  normalizeIsrc,
} from "@/features/matching/match-import-rows";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readRawIsrc(raw: unknown): string | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  const candidates = [
    record["isrc"],
    record["ISRC"],
    record["isrc_code"],
    record["track_isrc"],
    record["trackISRC"],
    record["product_isrc"],
    record["productISRC"],
  ];

  for (const value of candidates) {
    const parsed = readString(value);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}