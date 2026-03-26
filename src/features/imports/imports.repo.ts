import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type ImportRowInsert = {
  company_id: string;
  import_id: string;
  import_job_id: string;
  row_number: number;
  status: string;
  raw: Record<string, unknown>;
  canonical: Record<string, unknown>;
  normalized: Record<string, unknown>;
  raw_title: string | null;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  created_at: string;
  updated_at: string;
};

export async function resetImportJobData(params: {
  importJobId: string;
}): Promise<void> {
  const { importJobId } = params;

  const { data: allocationRuns, error: allocationRunsError } = await supabaseAdmin
    .from("allocation_runs")
    .select("id")
    .eq("import_job_id", importJobId);

  if (allocationRunsError) {
    throw new Error(
      `resetImportJobData: failed to load allocation runs: ${allocationRunsError.message}`
    );
  }

  const allocationRunIds = (allocationRuns ?? []).map((run) => run.id);

  if (allocationRunIds.length > 0) {
    const { error: blockersError } = await supabaseAdmin
      .from("allocation_run_blockers")
      .delete()
      .in("allocation_run_id", allocationRunIds);

    if (blockersError) {
      throw new Error(
        `resetImportJobData: failed to delete allocation blockers: ${blockersError.message}`
      );
    }
  }

  const { error: allocationLinesError } = await supabaseAdmin
    .from("allocation_lines")
    .delete()
    .eq("import_job_id", importJobId);

  if (allocationLinesError) {
    throw new Error(
      `resetImportJobData: failed to delete allocation lines: ${allocationLinesError.message}`
    );
  }

  const { error: allocationRunsDeleteError } = await supabaseAdmin
    .from("allocation_runs")
    .delete()
    .eq("import_job_id", importJobId);

  if (allocationRunsDeleteError) {
    throw new Error(
      `resetImportJobData: failed to delete allocation runs: ${allocationRunsDeleteError.message}`
    );
  }

  const { error: importRowsError } = await supabaseAdmin
    .from("import_rows")
    .delete()
    .eq("import_job_id", importJobId);

  if (importRowsError) {
    throw new Error(
      `resetImportJobData: failed to delete import rows: ${importRowsError.message}`
    );
  }

  const { error: importJobUpdateError } = await supabaseAdmin
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

  if (importJobUpdateError) {
    throw new Error(
      `resetImportJobData: failed to reset import job status: ${importJobUpdateError.message}`
    );
  }
}

export async function insertImportRows(rows: ImportRowInsert[]): Promise<void> {
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