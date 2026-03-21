import { RankedCandidate, WorkCandidate } from "./matching-types";
import { normalizeMatchText } from "./normalize-match-text";

function similarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  const union = new Set([...aWords, ...bWords]).size;

  return union === 0 ? 0 : intersection / union;
}

export function scoreWorkCandidate(params: {
  sourceWorkRef: string | null;
  sourceIsrc: string | null;
  sourceUpc: string | null;
  sourceTitle: string | null;
  sourceArtist: string | null;
  candidate: WorkCandidate;
}): RankedCandidate {
  const sourceTitleNorm = normalizeMatchText(params.sourceTitle);
  const sourceArtistNorm = normalizeMatchText(params.sourceArtist);

  const candidateTitleNorm = normalizeMatchText(
    params.candidate.normalized_title ?? params.candidate.title,
  );
  const candidateArtistNorm = normalizeMatchText(
    params.candidate.normalized_artist_name ?? params.candidate.artist_name,
  );

  const exactWorkRef = 0;
  const exactIsrc =
    params.sourceIsrc &&
    params.candidate.isrc &&
    params.sourceIsrc.trim().toUpperCase() === params.candidate.isrc.trim().toUpperCase()
      ? 100
      : 0;

  const exactUpc =
    params.sourceUpc &&
    params.candidate.upc &&
    params.sourceUpc.trim().toUpperCase() === params.candidate.upc.trim().toUpperCase()
      ? 40
      : 0;

  const exactTitle =
    sourceTitleNorm && candidateTitleNorm && sourceTitleNorm === candidateTitleNorm
      ? 35
      : 0;

  const exactArtist =
    sourceArtistNorm && candidateArtistNorm && sourceArtistNorm === candidateArtistNorm
      ? 25
      : 0;

  const fuzzyTitleScore = Math.round(similarity(sourceTitleNorm, candidateTitleNorm) * 20);
  const fuzzyArtistScore = Math.round(similarity(sourceArtistNorm, candidateArtistNorm) * 15);

  let penalties = 0;

  if (sourceTitleNorm && candidateTitleNorm && fuzzyTitleScore < 8) penalties -= 15;
  if (sourceArtistNorm && candidateArtistNorm && fuzzyArtistScore < 5) penalties -= 10;

  const total =
    exactWorkRef +
    exactIsrc +
    exactUpc +
    exactTitle +
    exactArtist +
    fuzzyTitleScore +
    fuzzyArtistScore +
    penalties;

  let method: RankedCandidate["method"] = "none";

  if (exactIsrc > 0 && exactTitle > 0) method = "exact_isrc_title";
  else if (exactIsrc > 0) method = "exact_isrc";
  else if (exactUpc > 0 && exactTitle > 0) method = "exact_upc_title";
  else if (exactTitle > 0 && exactArtist > 0) method = "exact_title_artist";
  else if (fuzzyTitleScore > 0 || fuzzyArtistScore > 0) method = "fuzzy_title_artist";

  const reasons: string[] = [];
  if (exactIsrc) reasons.push("Exact ISRC match");
  if (exactUpc) reasons.push("Exact UPC match");
  if (exactTitle) reasons.push("Exact normalized title match");
  if (exactArtist) reasons.push("Exact normalized artist match");
  if (fuzzyTitleScore >= 12) reasons.push("Strong fuzzy title similarity");
  if (fuzzyArtistScore >= 8) reasons.push("Strong fuzzy artist similarity");
  if (penalties < 0) reasons.push("Mismatch penalties applied");

  return {
    workId: params.candidate.id,
    method,
    confidence: Math.max(0, Math.min(100, total)),
    score: {
      exactWorkRef,
      exactIsrc,
      exactUpc,
      exactTitle,
      exactArtist,
      fuzzyTitle: fuzzyTitleScore,
      fuzzyArtist: fuzzyArtistScore,
      penalties,
      total,
    },
    reasons,
  };
}