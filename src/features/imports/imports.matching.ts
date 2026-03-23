import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { findWorkByAlias } from "@/features/matching/work-alias.repo";

type ImportRowRecord = {
  id: string;
  raw_title: string | null;
  canonical: Record<string, unknown> | null;
  normalized: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
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

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function chunkArray<T>(items: T[], size: number): T[][];
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

export function normalizeIsrc(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return normalized.length > 0 ? normalized : null;
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

async function resolveRowMatch(params: {
  companyId: string;
  row: ImportRowRecord;
  now: string;
}): Promise<ImportRowUpdate> {
  const title = readCandidateTitle(params.row);
  const artist = readCandidateArtist(params.row);
  const isrc = readCandidateIsrc(params.row);

  if (!title && !isrc) {
    return {
      id: params.row.id,
      work_id: null,
      matched_work_id: null,
      match_confidence: null,
      match_source: null,
      status: "needs_review",
      updated_at: params.now,
    };
  }

  const aliasWorkId = await findWorkByAlias({
    companyId: params.companyId,
    title,
    artist,
    isrc,
  });

  if (aliasWorkId) {
    return {
      id: params.row.id,
      work_id: aliasWorkId,
      matched_work_id: aliasWorkId,
      match_confidence: 1,
      match_source: "alias",
      status: "matched",
      updated_at: params.now,
    };
  }

  return {
    id: params.row.id,
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

  const chunks = chunkArray(updates, 500);

  for (const chunk of chunks) {
    const { error } = await supabaseAdmin
      .from("import_rows")
      .upsert(chunk, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to persist import row updates: ${error.message}`);
    }
  }
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
    .limit(10000);

  if (rowsError) {
    throw new Error(`Failed to load import rows for matching: ${rowsError.message}`);
  }

  const typedRows = (rows ?? []) as ImportRowRecord[];

  if (typedRows.length === 0) {
    const { data: aggregates, error: aggregateError } = await supabaseAdmin
      .from("import_rows")
      .select("status, work_id")
      .eq("import_job_id", params.importJobId)
      .limit(10000);

    if (aggregateError) {
      throw new Error(`Failed to reload import row aggregates: ${aggregateError.message}`);
    }

    const parsedRowCount = (aggregates ?? []).filter((row) => row.status === "parsed").length;
    const invalidRowCount = (aggregates ?? []).filter((row) => row.status === "invalid").length;
    const matchedRowCount = (aggregates ?? []).filter((row) => row.work_id != null).length;
    const reviewRowCount = (aggregates ?? []).filter(
      (row) => row.status === "needs_review"
    ).length;

    const { error: updateJobError } = await supabaseAdmin
      .from("import_jobs")
      .update({
        status: matchedRowCount > 0 ? "matched" : "parsed",
        parsed_row_count: parsedRowCount,
        invalid_row_count: invalidRowCount,
        matched_row_count: matchedRowCount,
        review_row_count: reviewRowCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.importJobId);

    if (updateJobError) {
      throw new Error(`Failed to update import job after empty matching: ${updateJobError.message}`);
    }

    return {
      importJobId: params.importJobId,
      matchedCount: 0,
      reviewCount: reviewRowCount,
    };
  }

  const now = new Date().toISOString();
  const matchChunks = chunkArray(typedRows, 25);
  const updates: ImportRowUpdate[] = [];

  for (const chunk of matchChunks) {
    const resolvedChunk = await Promise.all(
      chunk.map((row) =>
        resolveRowMatch({
          companyId: params.companyId,
          row,
          now,
        })
      )
    );

    updates.push(...resolvedChunk);
  }

  await applyImportRowUpdates(updates);

  const matchedCount = updates.filter((row) => row.status === "matched").length;
  const reviewCount = updates.filter((row) => row.status === "needs_review").length;

  const { data: aggregates, error: aggregateError } = await supabaseAdmin
    .from("import_rows")
    .select("status, work_id")
    .eq("import_job_id", params.importJobId)
    .limit(10000);

  if (aggregateError) {
    throw new Error(`Failed to reload import row aggregates: ${aggregateError.message}`);
  }

  const parsedRowCount = (aggregates ?? []).filter((row) => row.status === "parsed").length;
  const invalidRowCount = (aggregates ?? []).filter((row) => row.status === "invalid").length;
  const matchedRowCount = (aggregates ?? []).filter((row) => row.work_id != null).length;
  const reviewRowCount = (aggregates ?? []).filter(
    (row) => row.status === "needs_review"
  ).length;

  const { error: updateJobError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: matchedRowCount > 0 ? "matched" : "parsed",
      parsed_row_count: parsedRowCount,
      invalid_row_count: invalidRowCount,
      matched_row_count: matchedRowCount,
      review_row_count: reviewRowCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.importJobId);

  if (updateJobError) {
    throw new Error(`Failed to update import job after matching: ${updateJobError.message}`);
  }

  return {
    importJobId: params.importJobId,
    matchedCount,
    reviewCount,
  };
}