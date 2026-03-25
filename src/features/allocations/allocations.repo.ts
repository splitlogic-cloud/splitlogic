import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  AllocationCandidateBlocker,
  AllocationCandidateLine,
  AllocationRunResult,
  AllocationRunStatus,
  ImportRowForAllocation,
  MatchedImportRowForAllocation,
  WorkSplitRecord,
} from "./allocations-types";

type AllocationLineInsert = {
  allocation_run_id: string;
  company_id: string;
  import_job_id: string;
  import_row_id: string;
  work_id: string | null;
  party_id: string;
  role?: string | null;
  source_split_id?: string | null;
  row_amount?: number | null;
  share_bps?: number | null;
  allocated_amount: number;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
};

function serializeError(error: unknown): string {
  if (!error) return "unknown";

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function assertAllocationRunStatus(status: string): asserts status is AllocationRunStatus {
  const allowed: AllocationRunStatus[] = ["pending", "processing", "completed", "failed"];

  if (!allowed.includes(status as AllocationRunStatus)) {
    throw new Error(
      `Invalid allocation run status "${status}". Allowed: ${allowed.join(", ")}`
    );
  }
}

/**
 * Create allocation run
 */

export async function createAllocationRun(params: {
  companyId: string;
  importJobId: string;
  currency: string | null;
  createdBy?: string | null;
  idempotencyKey?: string | null;
}): Promise<{ id: string }> {
  const now = new Date().toISOString();

  const insertPayload: Record<string, unknown> = {
    company_id: params.companyId,
    import_job_id: params.importJobId,
    status: "processing",
    currency: params.currency,
    started_at: now,
    created_at: now,
    updated_at: now,
  };

  if (params.createdBy !== undefined) {
    insertPayload.created_by = params.createdBy;
  }

  if (params.idempotencyKey !== undefined) {
    insertPayload.idempotency_key = params.idempotencyKey;
  }

  console.log("[allocation_runs.create] insertPayload =", insertPayload);

  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data) {
    console.error("[allocation_runs.create] failed", {
      insertPayload,
      error,
    });

    throw new Error(
      `createAllocationRun failed: ${error?.message ?? "unknown"} | payload=${serializeError(
        insertPayload
      )} | dbError=${serializeError(error)}`
    );
  }

  console.log("[allocation_runs.create] created", data);

  return data;
}

/**
 * Legacy status setter kept for compatibility
 */

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
  const now = new Date().toISOString();

  assertAllocationRunStatus(params.status);

  const payload: Record<string, unknown> = {
    status: params.status,
    updated_at: now,
  };

  if (params.status === "processing") {
    payload.started_at = now;
  }

  if (params.status === "completed") {
    payload.finished_at = now;
    payload.completed_at = now;
  }

  if (params.status === "failed") {
    payload.finished_at = now;
    payload.failed_at = now;
  }

  if (params.totals) {
    Object.assign(payload, params.totals);
  }

  console.log("[allocation_runs.setStatus] payload =", {
    allocationRunId: params.allocationRunId,
    payload,
  });

  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update(payload)
    .eq("id", params.allocationRunId);

  if (error) {
    console.error("[allocation_runs.setStatus] failed", {
      allocationRunId: params.allocationRunId,
      payload,
      error,
    });

    throw new Error(
      `setAllocationRunStatus failed: ${error.message} | payload=${serializeError(payload)}`
    );
  }
}

/**
 * Import job lookups
 */

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

export async function getImportJobForCompany(
  companyId: string,
  importJobId: string
): Promise<{ id: string; company_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", importJobId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error(`getImportJobForCompany failed: ${error.message}`);
  }

  return data;
}

/**
 * Import row fetchers
 */

export async function getMatchedRowsForAllocation(
  importJobId: string
): Promise<MatchedImportRowForAllocation[]> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select(
      "id, company_id, import_job_id, matched_work_id, currency, net_amount, gross_amount, status"
    )
    .eq("import_job_id", importJobId)
    .eq("status", "matched")
    .not("matched_work_id", "is", null)
    .order("row_number", { ascending: true });

  if (error || !data) {
    throw new Error(`getMatchedRowsForAllocation failed: ${error?.message ?? "unknown"}`);
  }

  return data as MatchedImportRowForAllocation[];
}

export async function listImportRowsForAllocation(
  companyId: string,
  importJobId: string
): Promise<ImportRowForAllocation[]> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select(`
      id,
      company_id,
      import_job_id,
      row_number,
      status,
      matched_work_id,
      matched_work_confidence,
      currency,
      net_amount,
      gross_amount
    `)
    .eq("company_id", companyId)
    .eq("import_job_id", importJobId)
    .in("status", ["matched", "allocated"])
    .not("matched_work_id", "is", null)
    .order("row_number", { ascending: true });

  if (error) {
    throw new Error(`listImportRowsForAllocation failed: ${error.message}`);
  }

  const rows = (data ?? []).map((row) => {
    const netAmount = row.net_amount == null ? null : Number(row.net_amount);
    const grossAmount = row.gross_amount == null ? null : Number(row.gross_amount);

    return {
      ...row,
      amount: netAmount ?? grossAmount ?? null,
    };
  });

  return rows as ImportRowForAllocation[];
}

/**
 * Work split fetchers
 */

export async function getWorkSplitsForWorks(params: {
  companyId: string;
  workIds: string[];
}): Promise<WorkSplitRecord[]> {
  if (params.workIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("work_splits")
    .select("id, work_id, party_id, share_bps, role, recoupable, priority")
    .eq("company_id", params.companyId)
    .in("work_id", params.workIds);

  if (error) {
    throw new Error(`getWorkSplitsForWorks failed: ${error.message}`);
  }

  return (data ?? []) as WorkSplitRecord[];
}

export async function listWorkSplitsForWorkIds(
  companyId: string,
  workIds: string[]
): Promise<WorkSplitRecord[]> {
  if (workIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("work_splits")
    .select("id, work_id, party_id, share_bps, role, recoupable, priority")
    .eq("company_id", companyId)
    .in("work_id", workIds);

  if (error) {
    throw new Error(`listWorkSplitsForWorkIds failed: ${error.message}`);
  }

  return (data ?? []) as WorkSplitRecord[];
}

/**
 * Allocation line inserts
 */

export async function insertAllocationLines(lines: AllocationLineInsert[]): Promise<void> {
  if (lines.length === 0) {
    return;
  }

  const chunkSize = 500;

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin.from("allocation_lines").insert(chunk);

    if (error) {
      console.error("[allocation_lines.insertAllocationLines] failed", {
        chunkSize: chunk.length,
        firstRow: chunk[0] ?? null,
        error,
      });

      throw new Error(`insertAllocationLines failed: ${error.message}`);
    }
  }
}

export async function insertAllocationRunLines(
  lines: AllocationCandidateLine[]
): Promise<void> {
  if (lines.length === 0) {
    return;
  }

  const chunkSize = 500;

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin.from("allocation_lines").insert(chunk);

    if (error) {
      console.error("[allocation_lines.insertAllocationRunLines] failed", {
        chunkSize: chunk.length,
        firstRow: chunk[0] ?? null,
        error,
      });

      throw new Error(`insertAllocationRunLines failed: ${error.message}`);
    }
  }
}

export async function insertAllocationRunBlockers(
  blockers: AllocationCandidateBlocker[]
): Promise<void> {
  if (blockers.length === 0) {
    return;
  }

  const chunkSize = 500;

  for (let i = 0; i < blockers.length; i += chunkSize) {
    const chunk = blockers.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin
      .from("allocation_run_blockers")
      .insert(chunk);

    if (error) {
      console.error("[allocation_run_blockers.insert] failed", {
        chunkSize: chunk.length,
        firstRow: chunk[0] ?? null,
        error,
      });

      throw new Error(`insertAllocationRunBlockers failed: ${error.message}`);
    }
  }
}

/**
 * Import row / job status updates
 */

export async function markRowsAllocated(params: {
  importRowIds: string[];
}): Promise<void> {
  if (params.importRowIds.length === 0) {
    return;
  }

  const payload = {
    allocation_status: "allocated",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update(payload)
    .in("id", params.importRowIds);

  if (error) {
    console.error("[import_rows.markRowsAllocated] failed", {
      importRowIdsCount: params.importRowIds.length,
      firstImportRowId: params.importRowIds[0] ?? null,
      payload,
      error,
    });

    throw new Error(`markRowsAllocated failed: ${error.message}`);
  }
}

export async function updateImportRowsAllocationStatus(
  importJobId: string,
  status: string
): Promise<void> {
  const payload = {
    allocation_status: status,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update(payload)
    .eq("import_job_id", importJobId);

  if (error) {
    console.error("[import_rows.updateAllocationStatus] failed", {
      importJobId,
      payload,
      error,
    });

    throw new Error(`updateImportRowsAllocationStatus failed: ${error.message}`);
  }
}

export async function setImportJobStatus(
  importJobId: string,
  status: string
): Promise<void> {
  const payload = {
    status,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("import_jobs")
    .update(payload)
    .eq("id", importJobId);

  if (error) {
    throw new Error(`setImportJobStatus failed: ${error.message}`);
  }
}

/**
 * Run summaries
 */

export async function getLatestAllocationRunForImport(importJobId: string): Promise<{
  id: string;
  status: string;
  total_rows: number | null;
  allocated_rows: number | null;
  blocked_rows: number | null;
  total_net_amount: number | null;
  total_gross_amount: number | null;
  created_at: string;
  finished_at: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select(
      "id, status, total_rows, allocated_rows, blocked_rows, total_net_amount, total_gross_amount, created_at, finished_at"
    )
    .eq("import_job_id", importJobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestAllocationRunForImport failed: ${error.message}`);
  }

  return data;
}

export async function listAllocationRunsByCompany(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`listAllocationRunsByCompany failed: ${error.message}`);
  }

  return data ?? [];
}

export async function listAllocationBlockersForImport(importJobId: string) {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("id, status, row_number, raw_title")
    .eq("import_job_id", importJobId)
    .in("status", ["invalid", "needs_review", "unmatched"])
    .order("row_number", { ascending: true });

  if (error) {
    throw new Error(`listAllocationBlockersForImport failed: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Company lookup
 */

export async function getCompanyBySlug(companySlug: string) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (error) {
    throw new Error(`getCompanyBySlug failed: ${error.message}`);
  }

  return data;
}

/**
 * Finalization / failure lifecycle
 */

export async function failAllocationRun(params: {
  allocationRunId: string;
  errorMessage?: string | null;
}) {
  const { allocationRunId, errorMessage } = params;
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    status: "failed",
    failed_at: now,
    finished_at: now,
    updated_at: now,
  };

  if (errorMessage) {
    payload.error_message = errorMessage;
  }

  console.log("[allocation_runs.fail] payload =", {
    allocationRunId,
    payload,
  });

  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .update(payload)
    .eq("id", allocationRunId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[allocation_runs.fail] failed", {
      allocationRunId,
      payload,
      error,
    });

    throw new Error(`failAllocationRun failed: ${error.message}`);
  }

  return data;
}

export async function finalizeAllocationRun(params: {
  allocationRunId: string;
  lineCount?: number | null;
  totalSourceAmount?: number | null;
  totalAllocatedAmount?: number | null;
}) {
  const {
    allocationRunId,
    lineCount = null,
    totalSourceAmount = null,
    totalAllocatedAmount = null,
  } = params;

  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    status: "completed",
    completed_at: now,
    finished_at: now,
    updated_at: now,
  };

  if (lineCount !== null) {
    payload.line_count = lineCount;
  }

  if (totalSourceAmount !== null) {
    payload.total_source_amount = totalSourceAmount;
  }

  if (totalAllocatedAmount !== null) {
    payload.total_allocated_amount = totalAllocatedAmount;
  }

  console.log("[allocation_runs.finalize] payload =", {
    allocationRunId,
    payload,
  });

  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .update(payload)
    .eq("id", allocationRunId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[allocation_runs.finalize] failed", {
      allocationRunId,
      payload,
      error,
    });

    throw new Error(`finalizeAllocationRun failed: ${error.message}`);
  }

  return data;
}

/**
 * Small compatibility alias for older imports
 */

export type { AllocationRunResult };