import { MatchDecision, RankedCandidate } from "./matching-types";

export function decideMatch(candidates: RankedCandidate[]): MatchDecision {
  const ranked = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;

  if (!best) {
    return {
      status: "unmatched",
      matchedWorkId: null,
      confidence: null,
      method: null,
      candidates: [],
      explanation: {
        reason: "No candidates found",
      },
    };
  }

  const scoreGap = second ? best.confidence - second.confidence : best.confidence;

  if (best.confidence >= 100) {
    return {
      status: "matched",
      matchedWorkId: best.workId,
      confidence: best.confidence,
      method: best.method,
      candidates: ranked.slice(0, 5),
      explanation: {
        reason: "Auto-matched on very high confidence",
        scoreGap,
      },
    };
  }

  if (best.confidence >= 85 && scoreGap >= 20) {
    return {
      status: "matched",
      matchedWorkId: best.workId,
      confidence: best.confidence,
      method: best.method,
      candidates: ranked.slice(0, 5),
      explanation: {
        reason: "Auto-matched on strong confidence and clear leader",
        scoreGap,
      },
    };
  }

  if (best.confidence >= 60) {
    return {
      status: "needs_review",
      matchedWorkId: null,
      confidence: best.confidence,
      method: best.method,
      candidates: ranked.slice(0, 5),
      explanation: {
        reason: "Candidate exists but confidence below auto-match threshold",
        scoreGap,
      },
    };
  }

  return {
    status: "unmatched",
    matchedWorkId: null,
    confidence: best.confidence,
    method: best.method,
    candidates: ranked.slice(0, 5),
    explanation: {
      reason: "No candidate passed review threshold",
      scoreGap,
    },
  };
}