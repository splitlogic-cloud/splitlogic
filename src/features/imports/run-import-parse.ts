import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseImportFile } from "@/features/imports/parse-import-file";
import { canonicalizeImportRow } from "@/features/imports/canonicalize-import-row";

function normalizeRowStatus(params: {
  title: string | null;
  artist: string | null;
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

export async function runImportParse(importJobId: string): Promise<{
  importJobId: string;
  insertedRowCount: number;
  parsedRowCount: number;
  invalidRowCount: number;
}> {
  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, storage_path, file_name")
    .eq("id", importJobId)
    .maybeSingle();

  if (importJobError) {
    throw new Error(`Failed to load import job: ${importJobError.message}`);
  }

  if (!importJob) {
    throw new Error("Import job not found.");
  }

  const { error: setParsingError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "parsing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  if (setParsingError) {
    throw new Error(`Failed to set import job to parsing: ${setParsingError.message}`);
  }

  const parsedFile = await parseImportFile(importJob.storage_path);

  const { error: deleteRowsError } = await supabaseAdmin
    .from("import_rows")
    .delete()
    .eq("import_job_id", importJobId);

  if (deleteRowsError) {
    throw new Error(`Failed to clear old import rows: ${deleteRowsError.message}`);
  }

  const now = new Date().toISOString();

  const rowsToInsert = parsedFile.rows.map((raw, index) => {
    const canonical = canonicalizeImportRow(raw);

    const status = normalizeRowStatus({
      title: canonical.title,
      artist: canonical.artist,
      isrc: canonical.isrc,
      currency: canonical.currency,
      netAmount: canonical.net_amount,
      grossAmount: canonical.gross_amount,
    });

    return {
      company_id: importJob.company_id,
      import_job_id: importJobId,
      row_number: index + 1,
      status,
      raw,
      canonical,
      currency: canonical.currency,
      net_amount: canonical.net_amount,
      gross_amount: canonical.gross_amount,
      created_at: now,
      updated_at: now,
    };
  });

  if (rowsToInsert.length > 0) {
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
  }

  const parsedRowCount = rowsToInsert.filter((row) => row.status === "parsed").length;
  const invalidRowCount = rowsToInsert.filter((row) => row.status === "invalid").length;

  const { error: updateJobError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "parsed",
      updated_at: new Date().toISOString(),
      row_count: rowsToInsert.length,
    })
    .eq("id", importJobId);

  if (updateJobError) {
    throw new Error(`Failed to update import job after parse: ${updateJobError.message}`);
  }

  return {
    importJobId,
    insertedRowCount: rowsToInsert.length,
    parsedRowCount,
    invalidRowCount,
  };
}