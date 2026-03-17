import "server-only";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeIsrc(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function removeFeaturing(value: string): string {
  return value
    .replace(/\b(feat|ft|featuring)\.?\s+[^-()[\]]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeBracketedVersionNoise(value: string): string {
  return value.replace(/\((.*?)\)/g, " ").replace(/\[(.*?)\]/g, " ");
}

function removeVersionNoiseWords(value: string): string {
  return value
    .replace(
      /\b(remix|mix|version|radio edit|edit|live|acoustic|instrumental|mono|stereo|remaster(ed)?)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function removePunctuation(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s]/gu, " ");
}

export function normalizeText(value: string | null | undefined): string {
  const input = (value ?? "").trim().toLowerCase();
  if (!input) return "";

  return normalizeWhitespace(
    removePunctuation(
      removeVersionNoiseWords(
        removeBracketedVersionNoise(removeFeaturing(stripDiacritics(input)))
      )
    )
  );
}

export function normalizeArtist(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/\b(and|&|\+|x|vs)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/\b(single version|album version|original mix)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTitleArtistKey(
  title: string | null | undefined,
  artist: string | null | undefined
): string {
  return `${normalizeTitle(title)}__${normalizeArtist(artist)}`;
}

export function tokenize(value: string | null | undefined): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized.split(" ").map((x) => x.trim()).filter(Boolean);
}

export function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const aSet = new Set(a);
  const bSet = new Set(b);

  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }

  return overlap / Math.max(aSet.size, bSet.size);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

export type MatchInput = {
  title: string;
  artist: string;
  isrc: string;
};

export type MatchCandidate = {
  id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  normalized_title?: string | null;
  normalized_artist?: string | null;
  normalized_isrc?: string | null;
  normalized_title_artist?: string | null;
};

export type MatchDecision =
  | {
      matchedWorkId: string;
      source: "isrc_exact" | "title_artist_exact" | "fuzzy";
      confidence: number;
    }
  | {
      matchedWorkId: null;
      source: null;
      confidence: 0;
    };

function hasVersionConflict(a: string, b: string): boolean {
  const versionWords = ["remix", "live", "acoustic", "instrumental", "edit"];
  return versionWords.some((word) => {
    const aHas = a.includes(word);
    const bHas = b.includes(word);
    return aHas !== bHas;
  });
}

export function decideBestWorkMatch(
  input: MatchInput,
  candidates: MatchCandidate[]
): MatchDecision {
  const inputIsrc = normalizeIsrc(input.isrc);
  const inputTitle = normalizeTitle(input.title);
  const inputArtist = normalizeArtist(input.artist);
  const inputTitleTokens = tokenize(input.title);
  const inputArtistTokens = tokenize(input.artist);
  const inputKey = buildTitleArtistKey(input.title, input.artist);

  if (inputIsrc) {
    const exactIsrc = candidates.find(
      (c) => normalizeIsrc(c.isrc ?? c.normalized_isrc) === inputIsrc
    );

    if (exactIsrc) {
      return {
        matchedWorkId: exactIsrc.id,
        source: "isrc_exact",
        confidence: 1,
      };
    }
  }

  const exactKey = candidates.find((c) => {
    const candidateKey =
      c.normalized_title_artist && c.normalized_title_artist.trim()
        ? c.normalized_title_artist
        : buildTitleArtistKey(c.title, c.artist);

    return candidateKey === inputKey && inputKey !== "__";
  });

  if (exactKey) {
    return {
      matchedWorkId: exactKey.id,
      source: "title_artist_exact",
      confidence: 0.98,
    };
  }

  let best: { candidate: MatchCandidate; score: number } | null = null;

  for (const candidate of candidates) {
    const cTitle =
      candidate.normalized_title && candidate.normalized_title.trim()
        ? candidate.normalized_title
        : normalizeTitle(candidate.title);

    const cArtist =
      candidate.normalized_artist && candidate.normalized_artist.trim()
        ? candidate.normalized_artist
        : normalizeArtist(candidate.artist);

    const cTitleTokens = tokenize(
      candidate.title ?? candidate.normalized_title ?? ""
    );
    const cArtistTokens = tokenize(
      candidate.artist ?? candidate.normalized_artist ?? ""
    );

    let score = 0;

    const titleSim = similarity(inputTitle, cTitle);
    const artistSim = similarity(inputArtist, cArtist);
    const titleOverlap = overlapScore(inputTitleTokens, cTitleTokens);
    const artistOverlap = overlapScore(inputArtistTokens, cArtistTokens);

    score += titleSim * 0.45;
    score += artistSim * 0.25;
    score += titleOverlap * 0.2;
    score += artistOverlap * 0.1;

    if (inputTitle === cTitle) score += 0.15;
    if (inputArtist && inputArtist === cArtist) score += 0.1;

    if (hasVersionConflict(inputTitle, cTitle)) {
      score -= 0.2;
    }

    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  if (best) {
    const bestTitle =
      best.candidate.normalized_title && best.candidate.normalized_title.trim()
        ? best.candidate.normalized_title
        : normalizeTitle(best.candidate.title);

    const artistOverlap = overlapScore(
      inputArtistTokens,
      tokenize(best.candidate.artist ?? best.candidate.normalized_artist ?? "")
    );

    if (inputTitle === bestTitle && artistOverlap >= 0.7) {
      return {
        matchedWorkId: best.candidate.id,
        source: "title_artist_exact",
        confidence: Math.min(0.97, best.score),
      };
    }

    if (best.score >= 0.93) {
      return {
        matchedWorkId: best.candidate.id,
        source: "fuzzy",
        confidence: Math.min(0.96, best.score),
      };
    }
  }

  return {
    matchedWorkId: null,
    source: null,
    confidence: 0,
  };
}