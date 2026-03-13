import "server-only";

export function normalizeIsrc(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!normalized) return null;

  // Standard ISRC length = 12
  if (normalized.length !== 12) return normalized;

  return normalized;
}

export function readRawIsrc(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;

  const candidates = [
    record.isrc,
    record.ISRC,
    record.track_isrc,
    record.sound_recording_code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}