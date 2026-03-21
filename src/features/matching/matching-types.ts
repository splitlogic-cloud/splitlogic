export type MatchMethod =
  | "exact_work_ref"
  | "exact_isrc"
  | "exact_isrc_title"
  | "exact_upc_title"
  | "exact_title_artist"
  | "fuzzy_title_artist"
  | "none";

export type MatchRowStatus =
  | "matched"
  | "needs_review"
  | "unmatched"
  | "invalid";

export type WorkCandidate = {
  id: string;
  title: string | null;
  normalized_title: string | null;
  artist_name: string | null;
  normalized_artist_name: string | null;
  isrc: string | null;
  upc: string | null;
};

export type CandidateScoreBreakdown = {
  exactWorkRef: number;
  exactIsrc: number;
  exactUpc: number;
  exactTitle: number;
  exactArtist: number;
  fuzzyTitle: number;
  fuzzyArtist: number;
  penalties: number;
  total: number;
};

export type RankedCandidate = {
  workId: string;
  method: MatchMethod;
  confidence: number;
  score: CandidateScoreBreakdown;
  reasons: string[];
};

export type MatchDecision = {
  status: MatchRowStatus;
  matchedWorkId: string | null;
  confidence: number | null;
  method: MatchMethod | null;
  candidates: RankedCandidate[];
  explanation: Record<string, unknown>;
};