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

/** Rows may link to a job via `import_job_id` and/or legacy `import_id`. */
export function importRowsForJobOrFilter(importJobId: string): string {
  return `import_job_id.eq.${importJobId},import_id.eq.${importJobId}`;
}

export type AllocationRunListItem = {
  id: string;
  company_id: string;
  import_job_id: string;
  status: string;
  currency: string | null;
  engine_version: string | null;
  rules_version: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string | null;

  input_row_count: number;
  matched_row_count: number;
  candidate_row_count: number;
  eligible_row_count: number;
  blocked_row_count: number;
  allocated_row_count: number;
  unallocated_row_count: number;
  blocker_count: number;
  line_count: number;

  gross_amount_total: number;
  net_amount_total: number;
  allocated_amount_total: number;
  unallocated_amount_total: number;

  summary: Record<string, unknown> | null;
  error_message: string | null;
};

export type AllocationBlockerListItem = {
  id: string;
  company_id: string;
  allocation_run_id: string;
  allocation_candidate_id: string;
  import_row_id: string;
  work_id: string | null;
  blocker_code: string;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type JsonRecord = Record<string, unknown>;

type ImportRowForAllocationDbRow = {
  id: string;
  company_id: string;
  import_job_id: string | null;
  work_id: string | null;
  matched_work_id?: string | null;
  currency: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  status: string | null;
  raw: JsonRecord | null;
  canonical: JsonRecord | null;
  normalized: JsonRecord | null;
};

type WorkSplitDbRow = {
  id: string;
  company_id: string;
  work_id: string;
  party_id: string | null;
  role: string | null;
  share_bps: number | null;
  recoupable: boolean | null;
  effective_from: string | null;
  effective_to: string | null;
  priority: number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickFirstString(
  obj: JsonRecord | null,
  keys: string[],
): string | null {
  if (!obj) return null;

  for (const key of keys) {
    const value = pickString(obj[key]);
    if (value) return value;
  }

  return null;
}

function deriveTitle(row: ImportRowForAllocationDbRow): string | null {
  const raw = asRecord(row.raw);
  const canonical = asRecord(row.canonical);
  const normalized = asRecord(row.normalized);

  return (
    pickFirstString(canonical, [
      "title",
      "track_title",
      "song_title",
      "work_title",
      "release_title",
      "track",
      "product",
    ]) ??
    pickFirstString(normalized, [
      "title",
      "track_title",
      "song_title",
      "work_title",
      "release_title",
      "track",
      "product",
    ]) ??
    pickFirstString(raw, [
      "title",
      "track_title",
      "song_title",
      "work_title",
      "release_title",
      "track",
      "product",
      "Track Name",
      "Song Title",
    ]) ??
    null
  );
}

function deriveArtist(row: ImportRowForAllocationDbRow): string | null {
  const raw = asRecord(row.raw);
  const canonical = asRecord(row.canonical);
  const normalized = asRecord(row.normalized);

  return (
    pickFirstString(canonical, [
      "artist",
      "track_artist",
      "main_artist",
      "artist_name",
      "product_artist",
    ]) ??
    pickFirstString(normalized, [
      "artist",
      "track_artist",
      "main_artist",
      "artist_name",
      "product_artist",
    ]) ??
    pickFirstString(raw, [
      "artist",
      "track_artist",
      "main_artist",
      "artist_name",
      "product_artist",
      "Artist",
      "Primary Artist",
    ]) ??
    null
  );
}

function deriveIsrc(row: ImportRowForAllocationDbRow): string | null {
  const raw = asRecord(row.raw);
  const canonical = asRecord(row.canonical);
  const normalized = asRecord(row.normalized);

  return (
    pickFirstString(canonical, ["isrc", "isrc_code", "track_isrc"]) ??
    pickFirstString(normalized, ["isrc", "isrc_code", "track_isrc"]) ??
    pickFirstString(raw, [
      "isrc",
      "ISRC",
      "isrc_code",
      "track_isrc",
      "Track ISRC",
    ]) ??
    null
  );
}

function shareFractionFromBps(shareBps: number | null | undefined): number {
  return Number(shareBps ?? 0) / 10_000;
}

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
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "failed",
      failed_at: now,
      error_message: params.message,
      updated_at: now,
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
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "completed",
      completed_at: now,
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
      updated_at: now,
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
      matched_work_id,
      currency,
      gross_amount,
      net_amount,
      status,
      raw,
      canonical,
      normalized
    `)
    .eq("company_id", params.companyId)
    .or(importRowsForJobOrFilter(params.importJobId));

  if (error) {
    throw new Error(`loadImportRowsForAllocation failed: ${error.message}`);
  }

  const rows = (data ?? []) as ImportRowForAllocationDbRow[];

  return rows
    .map((row) => {
    const resolvedWorkId = row.work_id ?? row.matched_work_id ?? null;
    const raw = asRecord(row.raw);
    const normalized = asRecord(row.normalized);

    return {
      id: row.id,
      company_id: row.company_id,
      import_job_id: row.import_job_id,
      work_id: resolvedWorkId,
      matched_work_id: row.matched_work_id ?? null,
      currency: row.currency ?? null,
      gross_amount: row.gross_amount ?? null,
      net_amount: row.net_amount ?? null,
      status: row.status ?? null,
      title: deriveTitle(row),
      artist: deriveArtist(row),
      isrc: deriveIsrc(row),
      raw_payload: raw,
      normalized_payload: normalized,
    } as ImportRowForAllocation;
    })
    .filter((row) => row.work_id != null);
}

export async function loadSplitsForWorks(params: {
  companyId: string;
  workIds: string[];
}): Promise<SplitForAllocation[]> {
  if (params.workIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("work_splits")
    .select(`
      id,
      company_id,
      work_id,
      party_id,
      role,
      share_bps,
      recoupable,
      effective_from,
      effective_to,
      priority,
      notes,
      created_at,
      updated_at
    `)
    .eq("company_id", params.companyId)
    .in("work_id", params.workIds);

  if (error) {
    throw new Error(`loadSplitsForWorks failed: ${error.message}`);
  }

  const rows = (data ?? []) as WorkSplitDbRow[];

  return rows.map((row) => ({
    id: row.id,
    company_id: row.company_id,
    work_id: row.work_id,
    party_id: row.party_id,
    share_fraction: shareFractionFromBps(row.share_bps),
    role: row.role,
    valid_from: row.effective_from,
    valid_to: row.effective_to,
    created_at: row.created_at,
  })) as SplitForAllocation[];
}

export async function insertAllocationCandidate(
  input: Record<string, unknown>,
): Promise<{ id: string }> {
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

export async function insertAllocationCandidates(
  inputs: Record<string, unknown>[],
): Promise<void> {
  if (inputs.length === 0) {
    return;
  }

  const chunkSize = 500;

  for (let i = 0; i < inputs.length; i += chunkSize) {
    const chunk = inputs.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from("allocation_candidates")
      .insert(chunk);

    if (error) {
      throw new Error(`insertAllocationCandidates failed: ${error.message}`);
    }
  }
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
    throw new Error(
      `updateAllocationCandidateStatus failed: ${error.message}`,
    );
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

export async function insertAllocationLines(
  lines: AllocationLineInsert[],
): Promise<void> {
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

export function buildStableHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
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
    throw new Error(
      `computeAllocationRunSummary candidates failed: ${candidatesError.message}`,
    );
  }

  const { data: blockers, error: blockersError } = await supabaseAdmin
    .from("allocation_blockers")
    .select("blocker_code")
    .eq("allocation_run_id", params.allocationRunId);

  if (blockersError) {
    throw new Error(
      `computeAllocationRunSummary blockers failed: ${blockersError.message}`,
    );
  }

  const { data: lines, error: linesError } = await supabaseAdmin
    .from("allocation_lines")
    .select("allocated_amount")
    .eq("allocation_run_id", params.allocationRunId);

  if (linesError) {
    throw new Error(
      `computeAllocationRunSummary lines failed: ${linesError.message}`,
    );
  }

  const { count: inputRowCount, error: inputCountError } = await supabaseAdmin
    .from("import_rows")
    .select("*", { count: "exact", head: true })
    .eq("company_id", params.companyId)
    .or(importRowsForJobOrFilter(params.importJobId));

  if (inputCountError) {
    throw new Error(
      `computeAllocationRunSummary input count failed: ${inputCountError.message}`,
    );
  }

  const { count: matchedRowCount, error: matchedCountError } =
    await supabaseAdmin
      .from("import_rows")
      .select("*", { count: "exact", head: true })
      .eq("company_id", params.companyId)
      .or(importRowsForJobOrFilter(params.importJobId))
      .in("status", ["matched", "allocated"]);

  if (matchedCountError) {
    throw new Error(
      `computeAllocationRunSummary matched count failed: ${matchedCountError.message}`,
    );
  }

  const candidateRows = candidates ?? [];
  const blockerRows = blockers ?? [];
  const lineRows = lines ?? [];

  const candidateRowCount = candidateRows.length;
  const eligibleRowCount = candidateRows.filter(
    (row) => row.status === "eligible" || row.status === "allocated",
  ).length;
  const blockedRowCount = candidateRows.filter(
    (row) => row.status === "blocked",
  ).length;
  const allocatedRowCount = candidateRows.filter(
    (row) => row.status === "allocated",
  ).length;
  const unallocatedRowCount = candidateRows.filter(
    (row) => row.status !== "allocated",
  ).length;
  const blockerCount = blockerRows.length;
  const lineCount = lineRows.length;

  const grossAmountTotal = candidateRows.reduce(
    (sum, row) => sum + Number(row.gross_amount ?? 0),
    0,
  );

  const netAmountTotal = candidateRows.reduce(
    (sum, row) => sum + Number(row.net_amount ?? 0),
    0,
  );

  const allocatedAmountTotal = lineRows.reduce(
    (sum, row) => sum + Number(row.allocated_amount ?? 0),
    0,
  );

  const unallocatedAmountTotal = netAmountTotal - allocatedAmountTotal;

  const blockerMap = new Map<string, number>();

  for (const blocker of blockerRows) {
    const key = blocker.blocker_code ?? "unknown_error";
    blockerMap.set(key, (blockerMap.get(key) ?? 0) + 1);
  }

  const blockerBreakdown = [...blockerMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([blockerCode, count]) => ({
      blockerCode,
      count,
    }));

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

export async function getLatestAllocationRunForImport(params: {
  companyId: string;
  importJobId: string;
}): Promise<AllocationRunListItem | null> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select(`
      id,
      company_id,
      import_job_id,
      status,
      currency,
      engine_version,
      rules_version,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at,
      input_row_count,
      matched_row_count,
      candidate_row_count,
      eligible_row_count,
      blocked_row_count,
      allocated_row_count,
      unallocated_row_count,
      blocker_count,
      line_count,
      gross_amount_total,
      net_amount_total,
      allocated_amount_total,
      unallocated_amount_total,
      summary,
      error_message
    `)
    .eq("company_id", params.companyId)
    .eq("import_job_id", params.importJobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `getLatestAllocationRunForImport failed: ${error.message}`,
    );
  }

  return (data ?? null) as AllocationRunListItem | null;
}

export async function listAllocationRunsByCompany(params: {
  companyId: string;
  limit?: number;
}): Promise<AllocationRunListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select(`
      id,
      company_id,
      import_job_id,
      status,
      currency,
      engine_version,
      rules_version,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at,
      input_row_count,
      matched_row_count,
      candidate_row_count,
      eligible_row_count,
      blocked_row_count,
      allocated_row_count,
      unallocated_row_count,
      blocker_count,
      line_count,
      gross_amount_total,
      net_amount_total,
      allocated_amount_total,
      unallocated_amount_total,
      summary,
      error_message
    `)
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 100);

  if (error) {
    throw new Error(`listAllocationRunsByCompany failed: ${error.message}`);
  }

  return (data ?? []) as AllocationRunListItem[];
}

export async function listAllocationBlockersForImport(params: {
  companyId: string;
  importJobId: string;
}): Promise<AllocationBlockerListItem[]> {
  const { data: runs, error: runsError } = await supabaseAdmin
    .from("allocation_runs")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("import_job_id", params.importJobId);

  if (runsError) {
    throw new Error(
      `listAllocationBlockersForImport runs failed: ${runsError.message}`,
    );
  }

  const runIds = (runs ?? []).map((run) => run.id);

  if (runIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("allocation_blockers")
    .select(`
      id,
      company_id,
      allocation_run_id,
      allocation_candidate_id,
      import_row_id,
      work_id,
      blocker_code,
      message,
      details,
      created_at
    `)
    .eq("company_id", params.companyId)
    .in("allocation_run_id", runIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `listAllocationBlockersForImport failed: ${error.message}`,
    );
  }

  return (data ?? []) as AllocationBlockerListItem[];
}