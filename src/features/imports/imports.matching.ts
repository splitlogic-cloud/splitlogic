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

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readCandidateTitle(row: ImportRowRecord): string | null {
  return (
    pickString(row.normalized?.title) ??
    pickString(row.canonical?.title) ??
    pickString(row.canonical?.work_title) ??
    pickString(row.raw_title) ??
    pickString(row.raw?.title) ??
    pickString(row.raw?.track_title) ??
    pickString(row.raw?.work_title) ??
    null
  );
}

function readCandidateArtist(row: ImportRowRecord): string | null {
  return (
    pickString(row.normalized?.artist) ??
    pickString(row.canonical?.artist) ??
    pickString(row.canonical?.artist_name) ??
    pickString(row.raw?.artist) ??
    pickString(row.raw?.artist_name) ??
    pickString(row.raw?.track_artist) ??
    null
  );
}

function readCandidateIsrc(row: ImportRowRecord): string | null {
  const value =
    pickString(row.normalized?.isrc) ??
    pickString(row.canonical?.isrc) ??
    pickString(row.raw?.isrc) ??
    pickString(row.raw?.isrc_code) ??
    pickString(row.raw?.track_isrc) ??
    null;

  return value ? value.toUpperCase() : null;
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

  let matchedCount = 0;
  let reviewCount = 0;

  for (const row of typedRows) {
    const title = readCandidateTitle(row);
    const artist = readCandidateArtist(row);
    const isrc = readCandidateIsrc(row);

    if (!title && !isrc) {
      const { error } = await supabaseAdmin
        .from("import_rows")
        .update({
          status: "needs_review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (error) {
        throw new Error(`Failed to mark row as needs_review: ${error.message}`);
      }

      reviewCount += 1;
      continue;
    }

    const aliasWorkId = await findWorkByAlias({
      companyId: params.companyId,
      title,
      artist,
      isrc,
    });

    if (aliasWorkId) {
      const { error } = await supabaseAdmin
        .from("import_rows")
        .update({
          work_id: aliasWorkId,
          matched_work_id: aliasWorkId,
          match_confidence: 1,
          match_source: "alias",
          status: "matched",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (error) {
        throw new Error(`Failed to update matched import row: ${error.message}`);
      }

      matchedCount += 1;
      continue;
    }

    const { error } = await supabaseAdmin
      .from("import_rows")
      .update({
        status: "needs_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`Failed to update unmatched import row: ${error.message}`);
    }

    reviewCount += 1;
  }

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