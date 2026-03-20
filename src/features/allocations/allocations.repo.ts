import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  AllocationCandidateBlocker,
  AllocationCandidateLine,
  AllocationPartyTotal,
  AllocationRunBlockerRecord,
  AllocationRunRecord,
  ImportRowForAllocation,
  WorkSplitRecord,
} from "./allocations.types";

function mapNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pickRowAmount(row: {
  net_amount?: unknown;
  gross_amount?: unknown;
}): number | null {
  if (row.net_amount != null && row.net_amount !== "") {
    return mapNumber(row.net_amount);
  }
  if (row.gross_amount != null && row.gross_amount !== "") {
    return mapNumber(row.gross_amount);
  }
  return null;
}

export async function getCompanyBySlug(companySlug: string) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (error) throw new Error(`Failed to load company: ${error.message}`);
  return data;
}

export async function getImportJobForCompany(companyId: string, importJobId: string) {
  const { data, error } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, file_name, created_at")
    .eq("company_id", companyId)
    .eq("id", importJobId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load import job: ${error.message}`);
  return data;
}

export async function listImportRowsForAllocation(
  companyId: string,
  importJobId: string
): Promise<ImportRowForAllocation[]> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select(`
      id,
      import_job_id,
      row_number,
      raw,
      canonical,
      currency,
      net_amount,
      gross_amount,
      matched_work_id,
      match_confidence
    `)
    .eq("import_job_id", importJobId)
    .order("row_number", { ascending: true });

  if (error) throw new Error(`Failed to load import rows: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    company_id: companyId,
    import_job_id: String(row.import_job_id),
    row_number: row.row_number == null ? null : Number(row.row_number),
    amount: pickRowAmount(row),
    currency: row.currency ? String(row.currency) : null,
    matched_work_id: row.matched_work_id ? String(row.matched_work_id) : null,
    matched_work_confidence:
      row.match_confidence == null ? null : mapNumber(row.match_confidence),
    raw_json:
      row.canonical && typeof row.canonical === "object"
        ? (row.canonical as Record<string, unknown>)
        : row.raw && typeof row.raw === "object"
          ? (row.raw as Record<string, unknown>)
          : null,
  }));
}

export async function listWorkSplitsForWorkIds(
  companyId: string,
  workIds: string[]
): Promise<WorkSplitRecord[]> {
  if (workIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("work_splits")
    .select(
      "id, company_id, work_id, party_id, role, share_bps, recoupable, effective_from, effective_to, priority, notes"
    )
    .eq("company_id", companyId)
    .in("work_id", workIds)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load work splits: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    company_id: String(row.company_id),
    work_id: String(row.work_id),
    party_id: String(row.party_id),
    role: String(row.role),
    share_bps: Number(row.share_bps),
    recoupable: Boolean(row.recoupable),
    effective_from: row.effective_from ? String(row.effective_from) : null,
    effective_to: row.effective_to ? String(row.effective_to) : null,
    priority: Number(row.priority ?? 100),
    notes: row.notes ? String(row.notes) : null,
  }));
}

export async function createAllocationRun(params: {
  companyId: string;
  importJobId: string;
  currency: string | null;
  createdBy?: string | null;
  idempotencyKey?: string | null;
}): Promise<AllocationRunRecord> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .insert({
      company_id: params.companyId,
      import_job_id: params.importJobId,
      status: "processing",
      currency: params.currency,
      created_by: params.createdBy ?? null,
      idempotency_key: params.idempotencyKey ?? null,
      engine_version: "v2",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create allocation run: ${error.message}`);
  return data as AllocationRunRecord;
}

export async function insertAllocationRunLines(lines: AllocationCandidateLine[]) {
  if (lines.length === 0) return;
  const { error } = await supabaseAdmin.from("allocation_run_lines").insert(lines);
  if (error) throw new Error(`Failed to insert allocation lines: ${error.message}`);
}

export async function insertAllocationRunBlockers(blockers: AllocationCandidateBlocker[]) {
  if (blockers.length === 0) return;
  const { error } = await supabaseAdmin.from("allocation_run_blockers").insert(blockers);
  if (error) throw new Error(`Failed to insert allocation blockers: ${error.message}`);
}

export async function finalizeAllocationRun(params: {
  runId: string;
  inputRowCount: number;
  allocatedRowCount: number;
  blockerCount: number;
  grossAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
}) {
  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "completed",
      input_row_count: params.inputRowCount,
      allocated_row_count: params.allocatedRowCount,
      blocker_count: params.blockerCount,
      gross_amount: params.grossAmount,
      allocated_amount: params.allocatedAmount,
      unallocated_amount: params.unallocatedAmount,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.runId);

  if (error) throw new Error(`Failed to finalize allocation run: ${error.message}`);
}

export async function failAllocationRun(runId: string, errorMessage: string) {
  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "failed",
      error_message: errorMessage,
      failed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) throw new Error(`Failed to mark allocation run as failed: ${error.message}`);
}

export async function updateImportRowsAllocationStatus(
  importJobId: string,
  status: "completed" | "failed"
) {
  const { error } = await supabaseAdmin
    .from("import_rows")
    .update({ allocation_status: status })
    .eq("import_job_id", importJobId);

  if (error) throw new Error(`Failed to update import rows allocation status: ${error.message}`);
}

export async function getLatestAllocationRunForImport(
  companyId: string,
  importJobId: string
): Promise<AllocationRunRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select("*")
    .eq("company_id", companyId)
    .eq("import_job_id", importJobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load latest allocation run: ${error.message}`);
  return (data as AllocationRunRecord | null) ?? null;
}

export async function listAllocationRunsByCompany(
  companyId: string
): Promise<AllocationRunRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`load allocation runs failed: ${error.message}`);
  return (data as AllocationRunRecord[]) ?? [];
}

export async function getAllocationRunById(
  companyId: string,
  allocationRunId: string
): Promise<AllocationRunRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", allocationRunId)
    .maybeSingle();

  if (error) throw new Error(`load allocation run failed: ${error.message}`);
  return (data as AllocationRunRecord | null) ?? null;
}

export async function listAllocationBlockersForImport(
  companyId: string,
  importJobId: string,
  allocationRunId?: string | null
): Promise<AllocationRunBlockerRecord[]> {
  let query = supabaseAdmin
    .from("allocation_run_blockers")
    .select("*")
    .eq("company_id", companyId)
    .eq("import_job_id", importJobId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (allocationRunId) {
    query = query.eq("allocation_run_id", allocationRunId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load allocation blockers: ${error.message}`);
  return (data as AllocationRunBlockerRecord[]) ?? [];
}

export async function listAllocationTotalsByParty(
  companyId: string,
  importJobId: string,
  allocationRunId?: string | null
): Promise<AllocationPartyTotal[]> {
  let query = supabaseAdmin
    .from("allocation_run_party_totals_v")
    .select("party_id, party_name, currency, total_allocated_amount, line_count")
    .eq("company_id", companyId)
    .eq("import_job_id", importJobId)
    .order("total_allocated_amount", { ascending: false });

  if (allocationRunId) {
    query = query.eq("allocation_run_id", allocationRunId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load allocation totals: ${error.message}`);

  return (data ?? []).map((row) => ({
    party_id: String(row.party_id),
    party_name: row.party_name ? String(row.party_name) : null,
    currency: row.currency ? String(row.currency) : null,
    total_allocated_amount: mapNumber(row.total_allocated_amount),
    line_count: Number(row.line_count ?? 0),
  }));
}