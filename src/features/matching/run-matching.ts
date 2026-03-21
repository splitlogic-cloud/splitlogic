import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { decideMatch } from "./decide-match";
import { getRowsToMatch, findWorkCandidates, saveMatchDecision } from "./matching.repo";
import { scoreWorkCandidate } from "./score-work-candidate";

function readCanonicalString(
  canonical: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = canonical?.[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export async function runMatching(importJobId: string): Promise<{
  total: number;
  matched: number;
  needsReview: number;
  unmatched: number;
  invalid: number;
}> {
  const { error: startError } = await supabaseAdmin
    .from("import_jobs")
    .update({ status: "matching" })
    .eq("id", importJobId);

  if (startError) {
    throw new Error(`Failed to set matching status: ${startError.message}`);
  }

  const rows = await getRowsToMatch(importJobId);

  let matched = 0;
  let needsReview = 0;
  let unmatched = 0;
  let invalid = 0;

  for (const row of rows) {
    const canonical = row.canonical ?? {};

    const sourceIsrc = readCanonicalString(canonical, "isrc");
    const sourceUpc = readCanonicalString(canonical, "upc");
    const sourceTitle = readCanonicalString(canonical, "track_title");
    const sourceArtist = readCanonicalString(canonical, "artist_name");

    if (!sourceIsrc && !sourceUpc && !sourceTitle) {
      await saveMatchDecision({
        rowId: row.id,
        matchedWorkId: null,
        status: "invalid",
        confidence: null,
        method: null,
        candidates: [],
        explanation: {
          reason: "Row lacks matchable identifiers",
        },
      });
      invalid += 1;
      continue;
    }

    const candidates = await findWorkCandidates({
      companyId: row.company_id,
      sourceIsrc,
      sourceUpc,
      sourceTitle,
      sourceArtist,
    });

    const ranked = candidates.map((candidate) =>
      scoreWorkCandidate({
        sourceWorkRef: row.source_work_ref,
        sourceIsrc,
        sourceUpc,
        sourceTitle,
        sourceArtist,
        candidate,
      })
    );

    const decision = decideMatch(ranked);

    await saveMatchDecision({
      rowId: row.id,
      matchedWorkId: decision.matchedWorkId,
      status: decision.status,
      confidence: decision.confidence,
      method: decision.method,
      candidates: decision.candidates,
      explanation: decision.explanation,
    });

    if (decision.status === "matched") matched += 1;
    else if (decision.status === "needs_review") needsReview += 1;
    else if (decision.status === "unmatched") unmatched += 1;
    else invalid += 1;
  }

  const finalStatus =
    unmatched === 0 && needsReview === 0 ? "matched" : "parsed";

  const { error: finishError } = await supabaseAdmin
    .from("import_jobs")
    .update({ status: finalStatus })
    .eq("id", importJobId);

  if (finishError) {
    throw new Error(`Failed to finalize matching status: ${finishError.message}`);
  }

  return {
    total: rows.length,
    matched,
    needsReview,
    unmatched,
    invalid,
  };
}