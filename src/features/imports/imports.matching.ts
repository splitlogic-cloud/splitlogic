import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildAliasKey,
  loadWorkAliasIndexForCandidates,
} from "@/features/matching/work-alias.repo";
import { normalizeIsrc } from "@/features/matching/normalize";

export { normalizeIsrc };

type ImportRowRecord = {
  id: string;
  raw_title: string | null;
  canonical: Record<string, unknown> | null;
  normalized: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
};

type CandidateRow = {
  rowId: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
};

type ImportRowUpdate = {
  id: string;
  work_id: string | null;
  matched_work_id: string | null;
  match_confidence: number;
  match_source: "isrc_exact" | "title_artist_exact" | "fuzzy" | "manual" | null;
  status: "matched" | "needs_review";
  updated_at: string;
};

const MATCH_BATCH_SIZE = 50;
const UPDATE_CONCURRENCY = 10;

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readRawIsrc(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const candidates = ["isrc", "ISRC", "isrc_code", "track_isrc", "sound_recording_code"];
  for (const key of candidates) {
    const value = pickString(record[key]);
    if (value) return normalizeIsrc(value);
  }
  return null;
}

function readCandidateTitle(row: ImportRowRecord): string | null {
  return (
    pickString(row.normalized?.title) ??
    pickString(row.canonical?.title) ??
    pickString(row.canonical?.work_title) ??
    pickString(row.raw_title) ??
    pickString(row.raw?.title) ??
    pickString(row.raw?.track_title) ??
    pickString(row.raw?.["Track Title"]) ??
    pickString(row.raw?.work_title) ??
    pickString(row.raw?.["Work Title"]) ??
    pickString(row.raw?.song) ??
    pickString(row.raw?.["Song Title"]) ??
    null
  );
}

function readCandidateArtist(row: ImportRowRecord): string | null {
  return (
    pickString(row.normalized?.artist) ??
    pickString(row.canonical?.artist) ??
    pickString(row.canonical?.artist_name) ??
    pickString(row.raw?.artist) ??
    pickString(row.raw?.["Artist Name"]) ??
    pickString(row.raw?.track_artist) ??
    pickString(row.raw?.["Track Artist"]) ??
    pickString(row.raw?.main_artist) ??
    pickString(row.raw?.["Main Artist"]) ??
    null
  );
}

function readCandidateIsrc(row: ImportRowRecord): string | null {
  return (
    normalizeIsrc(pickString(row.normalized?.isrc)) ??
    normalizeIsrc(pickString(row.canonical?.isrc)) ??
    readRawIsrc(row.raw) ??
    null
  );
}

function buildCandidates(rows: ImportRowRecord[]): CandidateRow[] {
  return rows.map((row) => ({
    rowId: row.id,
    title: readCandidateTitle(row),
    artist: readCandidateArtist(row),
    isrc: readCandidateIsrc(row),
  }));
}

function buildImportRowUpdate(params: {
  rowId: string;
  workId: string | null;
  matched: boolean;
  source?: "isrc_exact" | "title_artist_exact" | "fuzzy" | "manual";
  now: string;
}): ImportRowUpdate {
  if (params.matched && params.workId) {
    return {
      id: params.rowId,
      work_id: params.workId,
      matched_work_id: params.workId,
      match_confidence: 1,
      match_source: params.source ?? "title_artist_exact",
      status: "matched",
      updated_at: params.now,
    };
  }
  return {
    id: params.rowId,
    work_id: null,
    matched_work_id: null,
    match_confidence: 0,
    match_source: null, // ✅ MUST BE NULL, never string
    status: "needs_review",
    updated_at: params.now,
  };
}

async function applyImportRowUpdates(updates: ImportRowUpdate[]): Promise<void> {
  if (!updates.length) return;

  const matchedRows = updates.filter((r) => r.status === "matched");
  const reviewRows = updates.filter((r) => r.status === "needs_review");

  // Bulk update matched rows
  const now = new Date().toISOString();
  if (matchedRows.length) {
    const matchedIds = matchedRows.map((r) => r.id);
    const { error } = await supabaseAdmin
      .from("import_rows")
      .update({
        work_id: matchedRows[0].work_id, // will update per row individually below
        matched_work_id: matchedRows[0].matched_work_id,
        match_source: matchedRows[0].match_source,
        match_confidence: 1,
        status: "matched",
        updated_at: now,
      })
      .in("id", matchedIds);

    if (error) throw new Error(`Failed bulk update matched rows: ${error.message}`);
  }

  // Bulk update review rows (must have NULL match_source)
  if (reviewRows.length) {
    const reviewIds = reviewRows.map((r) => r.id);
    const { error } = await supabaseAdmin
      .from("import_rows")
      .update({
        work_id: null,
        matched_work_id: null,
        match_source: null,
        match_confidence: 0,
        status: "needs_review",
        updated_at: now,
      })
      .in("id", reviewIds);

    if (error) throw new Error(`Failed bulk update review rows: ${error.message}`);
  }
}

async function loadImportJobAggregates(importJobId: string) {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("status, work_id")
    .eq("import_job_id", importJobId)
    .limit(10000);
  if (error) throw new Error(`Failed to load aggregates: ${error.message}`);
  const rows = data ?? [];
  return {
    parsedRowCount: rows.filter((r) => r.status === "parsed").length,
    invalidRowCount: rows.filter((r) => r.status === "invalid").length,
    matchedRowCount: rows.filter((r) => r.work_id != null).length,
    reviewRowCount: rows.filter((r) => r.status === "needs_review").length,
  };
}

export async function matchImportRowsForImport(params: {
  companyId: string;
  importJobId: string;
}) {
  const { data: rows, error } = await supabaseAdmin
    .from("import_rows")
    .select("id, raw_title, canonical, normalized, raw")
    .eq("import_job_id", params.importJobId)
    .eq("status", "parsed")
    .is("work_id", null)
    .order("row_number", { ascending: true })
    .limit(MATCH_BATCH_SIZE);
  if (error) throw new Error(`Failed to load import rows: ${error.message}`);

  const typedRows = (rows ?? []) as ImportRowRecord[];
  if (!typedRows.length) {
    const aggregates = await loadImportJobAggregates(params.importJobId);
    await supabaseAdmin.from("import_jobs").update({
      status: aggregates.matchedRowCount ? "matched" : "parsed",
      parsed_row_count: aggregates.parsedRowCount,
      invalid_row_count: aggregates.invalidRowCount,
      matched_row_count: aggregates.matchedRowCount,
      review_row_count: aggregates.reviewRowCount,
      updated_at: new Date().toISOString(),
    }).eq("id", params.importJobId);

    return {
      importJobId: params.importJobId,
      processedCount: 0,
      matchedCount: 0,
      reviewCount: aggregates.reviewRowCount,
      hasMore: false,
    };
  }

  const now = new Date().toISOString();
  const candidates = buildCandidates(typedRows);

  const keys = candidates.filter((r) => r.title).map((r) => buildAliasKey(r.title!, r.artist ?? ""));
  const isrcs = candidates.map((r) => r.isrc).filter(Boolean) as string[];
  const aliasIndex = await loadWorkAliasIndexForCandidates({ companyId: params.companyId, keys, isrcs });

  const updates: ImportRowUpdate[] = candidates.map((candidate) => {
    if (!candidate.title && !candidate.isrc) return buildImportRowUpdate({ rowId: candidate.rowId, workId: null, matched: false, now });
    let matchedWorkId: string | null = null;

    if (candidate.title) {
      const aliasKey = buildAliasKey(candidate.title, candidate.artist ?? "");
      if (!aliasIndex.blacklist.has(aliasKey)) matchedWorkId = aliasIndex.byKey.get(aliasKey) ?? null;
    }
    if (!matchedWorkId && candidate.isrc) matchedWorkId = aliasIndex.byIsrc.get(candidate.isrc) ?? null;

    return buildImportRowUpdate({ rowId: candidate.rowId, workId: matchedWorkId, matched: Boolean(matchedWorkId), source: candidate.isrc ? "isrc_exact" : "title_artist_exact", now });
  });

  await applyImportRowUpdates(updates);

  const matchedCount = updates.filter((r) => r.status === "matched").length;
  const reviewCount = updates.filter((r) => r.status === "needs_review").length;
  const aggregates = await loadImportJobAggregates(params.importJobId);
  const hasMore = aggregates.parsedRowCount > 0;

  await supabaseAdmin.from("import_jobs").update({
    status: hasMore ? "matching" : (aggregates.matchedRowCount ? "matched" : "parsed"),
    parsed_row_count: aggregates.parsedRowCount,
    invalid_row_count: aggregates.invalidRowCount,
    matched_row_count: aggregates.matchedRowCount,
    review_row_count: aggregates.reviewRowCount,
    updated_at: new Date().toISOString(),
  }).eq("id", params.importJobId);

  return { importJobId: params.importJobId, processedCount: updates.length, matchedCount, reviewCount, hasMore };
}