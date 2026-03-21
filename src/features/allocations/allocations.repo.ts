import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  AllocationLineInsert,
  AllocationRunResult,
  AllocationRunStatus,
  MatchedImportRowForAllocation,
  WorkSplitRecord,
} from "./allocation-types";

export async function createAllocationRun(params: {
  companyId: string;
  importJobId: string;
  currency: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .insert({
      company_id: params.companyId,
      import_job_id: params.importJobId,
      status: "running",
      currency: params.currency,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`createAllocationRun failed: ${error?.message ?? "unknown"}`);
  }

  return data;
}

export async function setAllocationRunStatus(params: {
  allocationRunId: string;
  status: AllocationRunStatus;
  totals?: Partial<{
    total_rows: number;
    allocated_rows: number;
    blocked_rows: number;
    total_net_amount: number;
    total_gross_amount: number;
  }>;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    status: params.status,
  };

  if (params.status !== "running") {
    payload.finished_at = new Date().toISOString();
  }

  if (params.totals) {
    Object.assign(payload, params.totals);
  }

  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update(payload)
    .eq("id", params.allocationRunId);

  if (error) {
    throw new Error(`setAllocationRunStatus failed: ${error.message}`);
  }
}

export async function getMatchedRowsForAllocation(
  importJobId: string,
): Promise<MatchedImportRowForAllocation[]> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("id, company_id, import_job_id, matched_work_id, currency, net_amount, gross_amount, status")
    .eq("import_job_id", importJobId)
    .eq("status", "matched")
    .not("matched_work_id", "is", null)
    .order("row_number", { ascending: true });

  if (error || !data) {
    throw new Error(`getMatchedRowsForAllocation failed: ${error?.message ?? "unknown"}`);
  }

  return data as MatchedImportRowForAllocation[];
}

export async function getWorkSplitsForWorks(params: {
  companyId: string;
  workIds: string[];
}): Promise<WorkSplitRecord[]> {
  if (params.workIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("work_splits")
    .select("work_id, party_id, share_percent")
    .eq("company_id", params.companyId)
    .in("work_id", params.workIds);

  if (error) {
    throw new Error(`getWorkSplitsForWorks failed: ${error.message}`);
  }

  return (data ?? []) as WorkSplitRecord[];
}

export async function insertAllocationLines(lines: AllocationLineInsert[]): Promise<void> {
  if (lines.length === 0) {
    return;
  }

  const chunkSize = 500;

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin
      .from("allocation_lines")
      .insert(chunk);

    if (error) {
      throw new Error(`insertAllocationLines failed: ${error.message}`);
    }
  }
}

export async function markRowsAllocated(params: {
  importRowIds: string[];
}): Promise<void> {
  if (params.importRowIds.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update({ status: "allocated" })
    .in("id", params.importRowIds);

  if (error) {
    throw new Error(`markRowsAllocated failed: ${error.message}`);
  }
}

export async function setImportJobStatus(importJobId: string, status: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("import_jobs")
    .update({ status })
    .eq("id", importJobId);

  if (error) {
    throw new Error(`setImportJobStatus failed: ${error.message}`);
  }
}

export async function getImportJobCompany(importJobId: string): Promise<{
  id: string;
  company_id: string;
}> {
  const { data, error } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", importJobId)
    .single();

  if (error || !data) {
    throw new Error(`getImportJobCompany failed: ${error?.message ?? "unknown"}`);
  }

  return data;
}

export async function getLatestAllocationRunForImport(importJobId: string): Promise<{
  id: string;
  status: string;
  total_rows: number;
  allocated_rows: number;
  blocked_rows: number;
  total_net_amount: number;
  total_gross_amount: number;
  created_at: string;
  finished_at: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select("id, status, total_rows, allocated_rows, blocked_rows, total_net_amount, total_gross_amount, created_at, finished_at")
    .eq("import_job_id", importJobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestAllocationRunForImport failed: ${error.message}`);
  }

  return data;
}