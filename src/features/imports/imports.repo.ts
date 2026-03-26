import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  ImportJobStatus,
  ImportRowStatus,
  RawImportRow,
} from "@/features/imports/imports-types";

export async function setImportJobStatus(
  importJobId: string,
  status: ImportJobStatus,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  if (error) {
    throw new Error(`setImportJobStatus failed: ${error.message}`);
  }
}

export async function resetImportJobData(importJobId: string): Promise<void> {
  const { data: allocationRuns, error: allocationRunsError } = await supabaseAdmin
    .from("allocation_runs")
    .select("id")
    .eq("import_job_id", importJobId);

  if (allocationRunsError) {
    throw new Error(
      `resetImportJobData failed to load allocation runs: ${allocationRunsError.message}`
    );
  }

  const allocationRunIds = (allocationRuns ?? []).map((run) => run.id);

  if (allocationRunIds.length > 0) {
    const { error: deleteBlockersError } = await supabaseAdmin
      .from("allocation_run_blockers")
      .delete()
      .in("allocation_run_id", allocationRunIds);

    if (deleteBlockersError) {
      throw new Error(
        `resetImportJobData failed to delete allocation_run_blockers: ${deleteBlockersError.message}`
      );
    }
  }

  const { error: deleteAllocationLinesError } = await supabaseAdmin
    .from("allocation_lines")
    .delete()
    .eq("import_job_id", importJobId);

  if (deleteAllocationLinesError) {
    throw new Error(
      `resetImportJobData failed to delete allocation_lines: ${deleteAllocationLinesError.message}`
    );
  }

  const { error: deleteAllocationRunsError } = await supabaseAdmin
    .from("allocation_runs")
    .delete()
    .eq("import_job_id", importJobId);

  if (deleteAllocationRunsError) {
    throw new Error(
      `resetImportJobData failed to delete allocation_runs: ${deleteAllocationRunsError.message}`
    );
  }

  const { error: deleteImportRowsError } = await supabaseAdmin
    .from("import_rows")
    .delete()
    .eq("import_job_id", importJobId);

  if (deleteImportRowsError) {
    throw new Error(
      `resetImportJobData failed to delete import_rows: ${deleteImportRowsError.message}`
    );
  }

  const { error: resetImportJobError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "uploaded",
      updated_at: new Date().toISOString(),
      row_count: 0,
      parsed_row_count: 0,
      invalid_row_count: 0,
      matched_row_count: 0,
      review_row_count: 0,
    })
    .eq("id", importJobId);

  if (resetImportJobError) {
    throw new Error(
      `resetImportJobData failed to reset import_jobs row: ${resetImportJobError.message}`
    );
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
  await resetImportJobData(importJobId);

  if (rows.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  const payload = rows.map((row) => ({
    company_id: companyId,
    import_job_id: importJobId,
    import_id: importJobId,
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
    created_at: now,
    updated_at: now,
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

export async function insertImportRows(
  rows: Array<Record<string, unknown>>
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const chunkSize = 500;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin
      .from("import_rows")
      .insert(chunk);

    if (error) {
      throw new Error(`insertImportRows failed: ${error.message}`);
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