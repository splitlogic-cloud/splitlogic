
function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function removeParentheticalContent(value: string): string {
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ");
}

function removeCommonVersionWords(value: string): string {
  return value
    .replace(/\bfeat(?:uring)?\.?\b/gi, " ")
    .replace(/\bft\.?\b/gi, " ")
    .replace(/\bversion\b/gi, " ")
    .replace(/\bremaster(?:ed)?\b/gi, " ")
    .replace(/\bremix\b/gi, " ")
    .replace(/\blive\b/gi, " ")
    .replace(/\bedit\b/gi, " ")
    .replace(/\bmono\b/gi, " ")
    .replace(/\bstereo\b/gi, " ");
}

function removePunctuation(value: string): string {
  return value.replace(/[^a-zA-Z0-9\s]/g, " ");
}

export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";

  const normalized = collapseWhitespace(
    removePunctuation(
      removeCommonVersionWords(
        removeParentheticalContent(stripDiacritics(value.toLowerCase()))
      )
    )
  );

  return normalized;
}

export function normalizeArtist(value: string | null | undefined): string {
  if (!value) return "";

  let normalized = value.toLowerCase();

  normalized = stripDiacritics(normalized);

  normalized = normalized
    .replace(/\bfeat(?:uring)?\.?.*$/gi, " ")
    .replace(/\bft\.?.*$/gi, " ")
    .replace(/\bx\b/gi, " ")
    .replace(/\band\b/gi, " ");

  normalized = removePunctuation(normalized);
  normalized = collapseWhitespace(normalized);

  return normalized;
}

export function normalizeIsrc(value: string | null | undefined): string {
  if (!value) return "";

  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

export function buildNormalizedTitleArtist(
  title: string | null | undefined,
  artist: string | null | undefined
): string {
  const normalizedTitle = normalizeText(title);
  const normalizedArtist = normalizeArtist(artist);

  return collapseWhitespace(`${normalizedTitle} ${normalizedArtist}`);
}