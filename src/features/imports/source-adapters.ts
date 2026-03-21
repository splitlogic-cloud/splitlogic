export type ImportSource =
  | "spotify"
  | "apple"
  | "youtube"
  | "soundcloud"
  | "qobuz"
  | "tidal"
  | "amazon"
  | "deezer"
  | "generic";

export function detectImportSource(headers: string[]): ImportSource {
  const normalized = headers.map((h) => h.trim().toLowerCase());

  const hasAny = (...needles: string[]) =>
    needles.some((needle) => normalized.includes(needle.toLowerCase()));

  if (hasAny("track name", "isrc", "artist name", "label name")) {
    return "spotify";
  }

  if (hasAny("apple identifier", "apple id", "vendor identifier")) {
    return "apple";
  }

  if (hasAny("asset id", "asset title", "claimed status")) {
    return "youtube";
  }

  if (hasAny("store", "release title", "track title", "sales date")) {
    return "generic";
  }

  return "generic";
}