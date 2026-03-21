import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { WorkCandidate } from "./matching-types";
import { normalizeMatchText } from "./normalize-match-text";

export async function getRowsToMatch(importJobId: string): Promise<Array<{
  id: string;
  company_id: string;
  source_work_ref: string | null;
  canonical: Record<string, unknown> | null;
  status: string;
}>> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("id, company_id, source_work_ref, canonical, status")
    .eq("import_job_id", importJobId)
    .in("status", ["parsed", "unmatched", "needs_review"]);

  if (error || !data) {
    throw new Error(`getRowsToMatch failed: ${error?.message ?? "unknown"}`);
  }

  return data;
}

export async function findWorkCandidates(params: {
  companyId: string;
  sourceIsrc: string | null;
  sourceUpc: string | null;
  sourceTitle: string | null;
  sourceArtist: string | null;
}): Promise<WorkCandidate[]> {
  if (params.sourceIsrc) {
    const { data, error } = await supabaseAdmin
      .from("works")
      .select("id, title, normalized_title, artist_name, normalized_artist_name, isrc, upc")
      .eq("company_id", params.companyId)
      .eq("isrc", params.sourceIsrc)
      .limit(20);

    if (error) throw new Error(`findWorkCandidates by ISRC failed: ${error.message}`);
    if ((data?.length ?? 0) > 0) return data as WorkCandidate[];
  }

  if (params.sourceUpc) {
    const { data, error } = await supabaseAdmin
      .from("works")
      .select("id, title, normalized_title, artist_name, normalized_artist_name, isrc, upc")
      .eq("company_id", params.companyId)
      .eq("upc", params.sourceUpc)
      .limit(20);

    if (error) throw new Error(`findWorkCandidates by UPC failed: ${error.message}`);
    if ((data?.length ?? 0) > 0) return data as WorkCandidate[];
  }

  const normalizedTitle = normalizeMatchText(params.sourceTitle);
  const normalizedArtist = normalizeMatchText(params.sourceArtist);

  if (!normalizedTitle && !normalizedArtist) {
    return [];
  }

  let query = supabaseAdmin
    .from("works")
    .select("id, title, normalized_title, artist_name, normalized_artist_name, isrc, upc")
    .eq("company_id", params.companyId)
    .limit(50);

  if (normalizedTitle) {
    query = query.ilike("normalized_title", `%${normalizedTitle}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`findWorkCandidates by title failed: ${error.message}`);
  }

  return (data ?? []) as WorkCandidate[];
}

export async function saveMatchDecision(params: {
  rowId: string;
  matchedWorkId: string | null;
  status: "matched" | "needs_review" | "unmatched" | "invalid";
  confidence: number | null;
  method: string | null;
  candidates: Record<string, unknown>;
  explanation: Record<string, unknown>;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    matched_work_id: params.matchedWorkId,
    status: params.status,
    match_confidence: params.confidence,
    match_method: params.method,
    match_candidates: params.candidates,
    match_explanation: params.explanation,
  };

  if (params.status === "matched") {
    payload.matched_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update(payload)
    .eq("id", params.rowId);

  if (error) {
    throw new Error(`saveMatchDecision failed: ${error.message}`);
  }
}