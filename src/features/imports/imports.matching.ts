import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildAliasKey,
  loadWorkAliasIndex,
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

type AggregateRow = {
  status: string | null;
  work_id: string | null;
};

type ImportRowUpdate = {
  id: string;
  work_id: string | null;
  matched_work_id: string | null;
  match_confidence: number | null;
  match_source: string | null;
  status: "matched" | "needs_review";
  updated_at: string;
};

const MATCH_BATCH_SIZE = 200;
const UPSERT_CHUNK_SIZE = 200;

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk size must be greater than 0");
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function readRawIsrc(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;

  const candidates = [
    record.isrc,
    record.ISRC,
    record.isrc_code,
    record.track_isrc,
    record.sound_recording_code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeIsrc(candidate);
    }
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
    pickString(row.raw?.Title) ??
    pickString(row.raw?.track) ??
    pickString(row.raw?.Track) ??
    pickString(row.raw?.TRACK) ??
    pickString(row.raw?.track_title) ??
    pickString(row.raw?.["Track Title"]) ??
    pickString(row.raw?.track_name) ??
    pickString(row.raw?.["Track Name"]) ??
    pickString(row.raw?.work_title) ??
    pickString(row.raw?.["Work Title"]) ??
    pickString(row.raw?.song) ??
    pickString(row.raw?.Song) ??
    pickString(row.raw?.song_title) ??
    pickString(row.raw?.["Song Title"]) ??
    pickString(row.raw?.recording) ??
    pickString(row.raw?.Recording) ??
    null
  );
}

function readCandidateArtist(row: ImportRowRecord): string | null {
  return (
    pickString(row.normalized?.artist) ??
    pickString(row.canonical?.artist) ??
    pickString(row.canonical?.artist_name) ??
    pickString(row.raw?.artist) ??
    pickString(row.raw?.Artist) ??
    pickString(row.raw?.artist_name) ??
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

function buildImportRowUpdate(params: {
  rowId: string;
  workId: string | null;
  matched: boolean;
  now: string;
}): ImportRowUpdate {
  if (params.matched && params.workId) {
    return {
      id: params.rowId,
      work_id: params.workId,
      matched_work_id: params.workId,
      match_confidence: 1,
      match_source: "alias",
      status: "matched",
      updated_at: params.now,
    };
  }

  return {
    id: params.rowId,
    work_id: null,
    matched_work_id: null,
    match_confidence: null,
    match_source: null,
    status: "needs_review",
    updated_at: params.now,
  };
}

async function applyImportRowUpdates(updates: ImportRowUpdate[]): Promise<void> {
  if (updates.length === 0) return;

  const chunks = chunkArray(updates, UPSERT_CHUNK_SIZE);

  for (const chunk of chunks) {
    const { error } = await supabaseAdmin
      .from("import_rows")
      .upsert(chunk, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to persist import row updates: ${error.message}`);
    }
  }
}

async function loadImportJobAggregates(importJobId: string): Promise<{
  parsedRowCount: number;
  invalidRowCount: number;
  matchedRowCount: number;
  reviewRowCount: number;
}> {
  const { data: aggregates, error: aggregateError } = await supabaseAdmin
    .from("import_rows")
    .select("status, work_id")
    .eq("import_job_id", importJobId)
    .limit(10000);

  if (aggregateError) {
    throw new Error(`Failed to reload import row aggregates: ${aggregateError.message}`);
  }

  const rows = (aggregates ?? []) as AggregateRow[];

  return {
    parsedRowCount: rows.filter((row) => row.status === "parsed").length,
    invalidRowCount: rows.filter((row) => row.status === "invalid").length,
    matchedRowCount: rows.filter((row) => row.work_id != null).length,
    reviewRowCount: rows.filter((row) => row.status === "needs_review").length,
  };
}

export async function matchImportRowsForImport(params: {
  companyId: string;
  importJobId: string;
}) {
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("import_rows")
    .select("id, raw_title, canonical, normalized, raw")
    .eq("import_job_id", params.importJobId)
    .eq("status", "parsed")
    .is("work_id", null)
    .order("row_number", { ascending: true })
    .limit(MATCH_BATCH_SIZE);

  if (rowsError) {
    throw new Error(`Failed to load import rows for matching: ${rowsError.message}`);
  }

  const typedRows = (rows ?? []) as ImportRowRecord[];

  if (typedRows.length === 0) {
    const aggregates = await loadImportJobAggregates(params.importJobId);

    const { error: updateJobError } = await supabaseAdmin
      .from("import_jobs")
      .update({
        status: aggregates.matchedRowCount > 0 ? "matched" : "parsed",
        parsed_row_count: aggregates.parsedRowCount,
        invalid_row_count: aggregates.invalidRowCount,
        matched_row_count: aggregates.matchedRowCount,
        review_row_count: aggregates.reviewRowCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.importJobId);

    if (updateJobError) {
      throw new Error(
        `Failed to update import job after empty matching: ${updateJobError.message}`
      );
    }

    return {
      importJobId: params.importJobId,
      processedCount: 0,
      matchedCount: 0,
      reviewCount: aggregates.reviewRowCount,
      hasMore: false,
    };
  }

  const aliasIndex = await loadWorkAliasIndex(params.companyId);
  const now = new Date().toISOString();

  const updates: ImportRowUpdate[] = typedRows.map((row) => {
    const title = readCandidateTitle(row);
    const artist = readCandidateArtist(row) ?? "";
    const isrc = readCandidateIsrc(row);

    if (!title && !isrc) {
      return buildImportRowUpdate({
        rowId: row.id,
        workId: null,
        matched: false,
        now,
      });
    }

    let matchedWorkId: string | null = null;

    if (title) {
      const aliasKey = buildAliasKey(title, artist);
      const isBlacklisted = aliasIndex.blacklist.has(aliasKey);

      if (!isBlacklisted) {
        matchedWorkId = aliasIndex.byKey.get(aliasKey) ?? null;
      }
    }

    if (!matchedWorkId && isrc) {
      matchedWorkId = aliasIndex.byIsrc.get(isrc) ?? null;
    }

    return buildImportRowUpdate({
      rowId: row.id,
      workId: matchedWorkId,
      matched: Boolean(matchedWorkId),
      now,
    });
  });

  await applyImportRowUpdates(updates);

  const matchedCount = updates.filter((row) => row.status === "matched").length;
  const currentReviewCount = updates.filter((row) => row.status === "needs_review").length;

  const aggregates = await loadImportJobAggregates(params.importJobId);

  const hasMore = aggregates.parsedRowCount > 0;

  const { error: updateJobError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: hasMore
        ? "matching"
        : aggregates.matchedRowCount > 0
          ? "matched"
          : "parsed",
      parsed_row_count: aggregates.parsedRowCount,
      invalid_row_count: aggregates.invalidRowCount,
      matched_row_count: aggregates.matchedRowCount,
      review_row_count: aggregates.reviewRowCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.importJobId);

  if (updateJobError) {
    throw new Error(`Failed to update import job after matching: ${updateJobError.message}`);
  }

  return {
    importJobId: params.importJobId,
    processedCount: updates.length,
    matchedCount,
    reviewCount: currentReviewCount,
    hasMore,
  };
}