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

  const { error: setParsingError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "parsing",
      updated_at: now,
    })
    .eq("id", importJobId);

  if (setParsingError) {
    throw new Error(`Failed to set import job to parsing: ${setParsingError.message}`);
  }

  try {
    const fileText = await downloadImportFileText(job);
    const parsedFile = await parseImportFile(fileText);

    if (parsedFile.rows.length === 0) {
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

      const rawTitle =
        canonical.title ??
        (typeof raw["title"] === "string" ? raw["title"].trim() : null) ??
        (typeof raw["track_title"] === "string" ? raw["track_title"].trim() : null) ??
        (typeof raw["work_title"] === "string" ? raw["work_title"].trim() : null) ??
        null;

      return {
        company_id: job.company_id,
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

    const { error: updateJobError } = await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "parsed",
        updated_at: new Date().toISOString(),
        row_count: insertedRowCount,
        parsed_row_count: parsedRowCount,
        invalid_row_count: invalidRowCount,
        matched_row_count: 0,
        review_row_count: 0,
      })
      .eq("id", importJobId);

    if (updateJobError) {
      throw new Error(`Failed to update import job after parse: ${updateJobError.message}`);
    }

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