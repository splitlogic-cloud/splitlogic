import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImportJobStatus, ImportRowStatus, RawImportRow } from "./import-types";

export async function setImportJobStatus(
  importJobId: string,
  status: ImportJobStatus,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("import_jobs")
    .update({ status })
    .eq("id", importJobId);

  if (error) {
    throw new Error(`setImportJobStatus failed: ${error.message}`);
  }
}

export async function replaceImportRowsForJob(
  companyId: string,
  importJobId: string,
  rows: Array<{
    rowNumber: number;
    raw: RawImportRow;
    normalized: Record<string, unknown> | null;
    canonical: Record<string, unknown> | null;
    currency: string | null;
    netAmount: string | null;
    grossAmount: string | null;
    sourceWorkRef: string | null;
    status: ImportRowStatus;
    errorCodes: string[];
  }>,
): Promise<void> {
  const { error: deleteError } = await supabaseAdmin
    .from("import_rows")
    .delete()
    .eq("import_job_id", importJobId);

  if (deleteError) {
    throw new Error(`delete import_rows failed: ${deleteError.message}`);
  }

  if (rows.length === 0) {
    return;
  }

  const payload = rows.map((row) => ({
    company_id: companyId,
    import_job_id: importJobId,
    row_number: row.rowNumber,
    raw: row.raw,
    normalized: row.normalized,
    canonical: row.canonical,
    currency: row.currency,
    net_amount: row.netAmount,
    gross_amount: row.grossAmount,
    source_work_ref: row.sourceWorkRef,
    status: row.status,
    error_codes: row.errorCodes,
  }));

  const chunkSize = 500;

  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin
      .from("import_rows")
      .insert(chunk);

    if (error) {
      throw new Error(`insert import_rows failed: ${error.message}`);
    }
  }
}

export async function getImportJobById(importJobId: string): Promise<{
  id: string;
  company_id: string;
  file_path: string | null;
  file_name: string | null;
  status: string;
}> {
  const { data, error } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, file_path, file_name, status")
    .eq("id", importJobId)
    .single();

  if (error || !data) {
    throw new Error(`getImportJobById failed: ${error?.message ?? "not found"}`);
  }

  return data;
}

export async function getImportJobRowCounts(importJobId: string): Promise<{
  total: number;
  parsed: number;
  invalid: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("status")
    .eq("import_job_id", importJobId);

  if (error || !data) {
    throw new Error(`getImportJobRowCounts failed: ${error?.message ?? "unknown"}`);
  }

  let parsed = 0;
  let invalid = 0;

  for (const row of data) {
    if (row.status === "parsed") parsed += 1;
    if (row.status === "invalid") invalid += 1;
  }

  return {
    total: data.length,
    parsed,
    invalid,
  };
}