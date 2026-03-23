import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseImportFile } from "@/features/imports/parse-import-file";
import { canonicalizeImportRow } from "@/features/imports/canonicalize-import-row";

type ImportJobRecord = {
  id: string;
  company_id: string;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

type CanonicalRow = ReturnType<typeof canonicalizeImportRow>;

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickFirstRawString(
  raw: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = toTrimmedString(raw[key]);
    if (value) return value;
  }
  return null;
}

function normalizeRowStatus(params: {
  title: string | null;
  isrc: string | null;
  currency: string | null;
  netAmount: number | null;
  grossAmount: number | null;
}): "parsed" | "invalid" {
  const hasIdentifier = Boolean(params.isrc || params.title);
  const hasAmount = params.netAmount !== null || params.grossAmount !== null;
  const hasCurrency = Boolean(params.currency);

  if (!hasIdentifier || !hasAmount || !hasCurrency) {
    return "invalid";
  }

  return "parsed";
}

function buildNormalizedRow(canonical: CanonicalRow) {
  return {
    title: canonical.title?.trim() ?? null,
    artist: canonical.artist?.trim() ?? null,
    isrc: canonical.isrc?.trim().toUpperCase() ?? null,
    currency: canonical.currency?.trim().toUpperCase() ?? null,
    source: canonical.source?.trim() ?? null,
    territory: canonical.territory?.trim().toUpperCase() ?? null,
    quantity: canonical.quantity ?? null,
    net_amount: canonical.net_amount ?? null,
    gross_amount: canonical.gross_amount ?? null,
    statement_date: canonical.statement_date ?? null,
  };
}

function resolveRawTitle(raw: Record<string, unknown>, canonical: CanonicalRow): string | null {
  return (
    canonical.title ??
    pickFirstRawString(raw, [
      "title",
      "Title",
      "track",
      "Track",
      "TRACK",
      "track_title",
      "Track Title",
      "track_name",
      "Track Name",
      "song_title",
      "Song Title",
      "song",
      "Song",
      "asset_title",
      "Asset Title",
      "release_track_name",
      "Release Track Name",
      "work_title",
      "Work Title",
      "recording",
      "Recording",
    ])
  );
}

function resolveStorageLocation(job: ImportJobRecord): {
  bucket: string;
  path: string;
} {
  const bucket = job.storage_bucket?.trim() || "imports";
  const path = job.storage_path?.trim() || null;

  if (!path) {
    throw new Error("Import job is missing storage_path.");
  }

  return { bucket, path };
}

async function downloadImportFileText(job: ImportJobRecord): Promise<string> {
  const { bucket, path } = resolveStorageLocation(job);

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(path);

  if (error || !data) {
    throw new Error(
      `Failed to download import file from storage: ${error?.message ?? "unknown error"}`
    );
  }

  const text = await data.text();

  if (!text.trim()) {
    throw new Error("Downloaded import file is empty.");
  }

  return text;
}

async function setImportJobStatus(
  importJobId: string,
  values: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("import_jobs")
    .update(values)
    .eq("id", importJobId);

  if (error) {
    throw new Error(`Failed to update import job: ${error.message}`);
  }
}

export async function runImportParse(importJobId: string): Promise<{
  importJobId: string;
  insertedRowCount: number;
  parsedRowCount: number;
  invalidRowCount: number;
}> {
  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select(
      `
      id,
      company_id,
      file_name,
      storage_bucket,
      storage_path
      `
    )
    .eq("id", importJobId)
    .maybeSingle();

  if (importJobError) {
    throw new Error(`Failed to load import job: ${importJobError.message}`);
  }

  if (!importJob) {
    throw new Error("Import job not found.");
  }

  const job = importJob as ImportJobRecord;
  const now = new Date().toISOString();

  await setImportJobStatus(importJobId, {
    status: "parsing",
    updated_at: now,
  });

  try {
    const fileText = await downloadImportFileText(job);
    const parsedFile = await parseImportFile(fileText);

    if (!parsedFile.rows.length) {
      throw new Error(
        `Import file parsed successfully but returned 0 data rows. File: ${job.file_name ?? "unknown"}`
      );
    }

    const { error: deleteRowsError } = await supabaseAdmin
      .from("import_rows")
      .delete()
      .eq("import_job_id", importJobId);

    if (deleteRowsError) {
      throw new Error(`Failed to clear old import rows: ${deleteRowsError.message}`);
    }

    const rowsToInsert = parsedFile.rows.map((raw, index) => {
      const canonical = canonicalizeImportRow(raw);
      const normalized = buildNormalizedRow(canonical);

      const status = normalizeRowStatus({
        title: canonical.title,
        isrc: canonical.isrc,
        currency: canonical.currency,
        netAmount: canonical.net_amount,
        grossAmount: canonical.gross_amount,
      });

      const rawTitle = resolveRawTitle(raw, canonical);

      return {
        company_id: job.company_id,
        import_id: importJobId,
        import_job_id: importJobId,
        row_number: index + 1,
        status,
        raw,
        canonical,
        normalized,
        raw_title: rawTitle,
        currency: canonical.currency ?? null,
        net_amount: canonical.net_amount ?? null,
        gross_amount: canonical.gross_amount ?? null,
        created_at: now,
        updated_at: now,
      };
    });

    const chunkSize = 500;

    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);

      const { error } = await supabaseAdmin
        .from("import_rows")
        .insert(chunk);

      if (error) {
        throw new Error(`Failed to insert import rows: ${error.message}`);
      }
    }

    const insertedRowCount = rowsToInsert.length;
    const parsedRowCount = rowsToInsert.filter((row) => row.status === "parsed").length;
    const invalidRowCount = rowsToInsert.filter((row) => row.status === "invalid").length;

    await setImportJobStatus(importJobId, {
      status: "parsed",
      updated_at: new Date().toISOString(),
      row_count: insertedRowCount,
      parsed_row_count: parsedRowCount,
      invalid_row_count: invalidRowCount,
      matched_row_count: 0,
      review_row_count: 0,
    });

    return {
      importJobId,
      insertedRowCount,
      parsedRowCount,
      invalidRowCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";

    await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", importJobId);

    throw new Error(message);
  }
}