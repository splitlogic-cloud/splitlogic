import "server-only";

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ALLOCATION_ENGINE_VERSION,
  ALLOCATION_RULES_VERSION,
} from "./allocations.constants";
import type {
  AllocationBlockerCode,
  AllocationLineInsert,
  AllocationRunSummary,
  ImportRowForAllocation,
  SplitForAllocation,
} from "./allocations-types";

export async function createAllocationRun(params: {
  companyId: string;
  importJobId: string;
  currency: string | null;
  createdBy?: string | null;
  idempotencyKey?: string | null;
  inputHash?: string | null;
}): Promise<{ id: string }> {
  const insertPayload = {
    company_id: params.companyId,
    import_job_id: params.importJobId,
    status: "processing",
    currency: params.currency,
    started_at: new Date().toISOString(),
    created_by: params.createdBy ?? null,
    engine_version: ALLOCATION_ENGINE_VERSION,
    rules_version: ALLOCATION_RULES_VERSION,
    idempotency_key: params.idempotencyKey ?? null,
    input_hash: params.inputHash ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    throw new Error(`createAllocationRun failed: ${error.message}`);
  }

  return { id: data.id };
}

export async function setAllocationRunFailed(params: {
  allocationRunId: string;
  message: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message: params.message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.allocationRunId);

  if (error) {
    throw new Error(`setAllocationRunFailed failed: ${error.message}`);
  }
}

export async function setAllocationRunCompleted(params: {
  allocationRunId: string;
  summary: AllocationRunSummary;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      input_row_count: params.summary.inputRowCount,
      matched_row_count: params.summary.matchedRowCount,
      candidate_row_count: params.summary.candidateRowCount,
      eligible_row_count: params.summary.eligibleRowCount,
      blocked_row_count: params.summary.blockedRowCount,
      allocated_row_count: params.summary.allocatedRowCount,
      unallocated_row_count: params.summary.unallocatedRowCount,
      blocker_count: params.summary.blockerCount,
      line_count: params.summary.lineCount,
      gross_amount_total: params.summary.grossAmountTotal,
      net_amount_total: params.summary.netAmountTotal,
      allocated_amount_total: params.summary.allocatedAmountTotal,
      unallocated_amount_total: params.summary.unallocatedAmountTotal,
      summary: {
        blockerBreakdown: params.summary.blockerBreakdown,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.allocationRunId);

  if (error) {
    throw new Error(`setAllocationRunCompleted failed: ${error.message}`);
  }
}

export async function loadImportRowsForAllocation(params: {
  companyId: string;
  importJobId: string;
}): Promise<ImportRowForAllocation[]> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select(`
      id,
      company_id,
      import_job_id,
      work_id,
      currency,
      gross_amount,
      net_amount,
      status,
      title,
      artist,
      isrc,
      raw_payload,
      normalized_payload
    `)
    .eq("company_id", params.companyId)
    .eq("import_job_id", params.importJobId)
    .in("status", ["matched", "allocated"]);

  if (error) {
    throw new Error(`loadImportRowsForAllocation failed: ${error.message}`);
  }

  return (data ?? []) as ImportRowForAllocation[];
}

export async function loadSplitsForWorks(params: {
  companyId: string;
  workIds: string[];
}): Promise<SplitForAllocation[]> {
  if (params.workIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("splits")
    .select(`
      id,
      company_id,
      work_id,
      party_id,
      share_fraction,
      status,
      role,
      valid_from,
      valid_to,
      created_at
    `)
    .eq("company_id", params.companyId)
    .in("work_id", params.workIds);

  if (error) {
    throw new Error(`loadSplitsForWorks failed: ${error.message}`);
  }

  return (data ?? []) as SplitForAllocation[];
}

export async function insertAllocationCandidate(input: Record<string, unknown>): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("allocation_candidates")
    .insert(input)
    .select("id")
    .single();

  if (error) {
    throw new Error(`insertAllocationCandidate failed: ${error.message}`);
  }

  return { id: data.id };
}

export async function updateAllocationCandidateStatus(params: {
  allocationCandidateId: string;
  status: "eligible" | "blocked" | "allocated" | "failed";
  blockerCode?: AllocationBlockerCode | null;
  blockerMessage?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("allocation_candidates")
    .update({
      status: params.status,
      blocker_code: params.blockerCode ?? null,
      blocker_message: params.blockerMessage ?? null,
    })
    .eq("id", params.allocationCandidateId);

  if (error) {
    throw new Error(`updateAllocationCandidateStatus failed: ${error.message}`);
  }
}

export async function insertAllocationBlocker(params: {
  companyId: string;
  allocationRunId: string;
  allocationCandidateId: string;
  importRowId: string;
  workId: string | null;
  blockerCode: AllocationBlockerCode;
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("allocation_blockers").insert({
    company_id: params.companyId,
    allocation_run_id: params.allocationRunId,
    allocation_candidate_id: params.allocationCandidateId,
    import_row_id: params.importRowId,
    work_id: params.workId,
    blocker_code: params.blockerCode,
    message: params.message,
    details: params.details ?? {},
  });

  if (error) {
    throw new Error(`insertAllocationBlocker failed: ${error.message}`);
  }
}

export async function insertAllocationLines(lines: AllocationLineInsert[]): Promise<void> {
  if (lines.length === 0) return;

  const chunkSize = 500;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin.from("allocation_lines").insert(chunk);
    if (error) {
      throw new Error(`insertAllocationLines failed: ${error.message}`);
    }
  }
}

export function buildStableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function computeAllocationRunSummary(params: {
  allocationRunId: string;
  companyId: string;
  importJobId: string;
}): Promise<AllocationRunSummary> {
  const { data: candidates, error: candidatesError } = await supabaseAdmin
    .from("allocation_candidates")
    .select("id,status,gross_amount,net_amount,blocker_code")
    .eq("allocation_run_id", params.allocationRunId);

  if (candidatesError) {
    throw new Error(`computeAllocationRunSummary candidates failed: ${candidatesError.message}`);
  }

  const { data: blockers, error: blockersError } = await supabaseAdmin
    .from("allocation_blockers")
    .select("blocker_code")
    .eq("allocation_run_id", params.allocationRunId);

  if (blockersError) {
    throw new Error(`computeAllocationRunSummary blockers failed: ${blockersError.message}`);
  }

  const { data: lines, error: linesError } = await supabaseAdmin
    .from("allocation_lines")
    .select("allocated_amount")
    .eq("allocation_run_id", params.allocationRunId);

  if (linesError) {
    throw new Error(`computeAllocationRunSummary lines failed: ${linesError.message}`);
  }

  const { count: inputRowCount, error: inputCountError } = await supabaseAdmin
    .from("import_rows")
    .select("*", { count: "exact", head: true })
    .eq("company_id", params.companyId)
    .eq("import_job_id", params.importJobId);

  if (inputCountError) {
    throw new Error(`computeAllocationRunSummary input count failed: ${inputCountError.message}`);
  }

  const { count: matchedRowCount, error: matchedCountError } = await supabaseAdmin
    .from("import_rows")
    .select("*", { count: "exact", head: true })
    .eq("company_id", params.companyId)
    .eq("import_job_id", params.importJobId)
    .in("status", ["matched", "allocated"]);

  if (matchedCountError) {
    throw new Error(`computeAllocationRunSummary matched count failed: ${matchedCountError.message}`);
  }

  const candidateRows = candidates ?? [];
  const blockerRows = blockers ?? [];
  const lineRows = lines ?? [];

  const candidateRowCount = candidateRows.length;
  const eligibleRowCount = candidateRows.filter((row) => row.status === "eligible" || row.status === "allocated").length;
  const blockedRowCount = candidateRows.filter((row) => row.status === "blocked").length;
  const allocatedRowCount = candidateRows.filter((row) => row.status === "allocated").length;
  const unallocatedRowCount = candidateRows.filter((row) => row.status !== "allocated").length;
  const blockerCount = blockerRows.length;
  const lineCount = lineRows.length;

  const grossAmountTotal = candidateRows.reduce((sum, row) => sum + Number(row.gross_amount ?? 0), 0);
  const netAmountTotal = candidateRows.reduce((sum, row) => sum + Number(row.net_amount ?? 0), 0);
  const allocatedAmountTotal = lineRows.reduce((sum, row) => sum + Number(row.allocated_amount ?? 0), 0);
  const unallocatedAmountTotal = netAmountTotal - allocatedAmountTotal;

  const blockerMap = new Map<string, number>();
  for (const blocker of blockerRows) {
    const key = blocker.blocker_code ?? "unknown_error";
    blockerMap.set(key, (blockerMap.get(key) ?? 0) + 1);
  }

  const blockerBreakdown = [...blockerMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([blockerCode, count]) => ({ blockerCode, count }));

  return {
    inputRowCount: inputRowCount ?? 0,
    matchedRowCount: matchedRowCount ?? 0,
    candidateRowCount,
    eligibleRowCount,
    blockedRowCount,
    allocatedRowCount,
    unallocatedRowCount,
    blockerCount,
    lineCount,
    grossAmountTotal,
    netAmountTotal,
    allocatedAmountTotal,
    unallocatedAmountTotal,
    blockerBreakdown,
  };
}