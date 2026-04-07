import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";

export type GenerateStatementsParams = {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  createdBy?: string | null;
  allocationRunId?: string | null;
};

export type GeneratedStatementResult = {
  statementIds: string[];
  count: number;
};

type AllocationLedgerRow = {
  id: string;
  company_id: string;
  party_id: string;
  work_id: string | null;
  earning_date: string | null;
  amount: number;
  currency: string | null;
};

function asString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function normalizeRow(raw: any): AllocationLedgerRow | null {
  const id = asString(raw.id);
  const companyId = asString(raw.company_id);
  const partyId = asString(raw.party_id);
  const amount = asNumber(raw.allocated_amount);

  if (!id || !companyId || !partyId || amount == null) return null;

  return {
    id,
    company_id: companyId,
    party_id: partyId,
    work_id: asString(raw.work_id),
    earning_date: asString(raw.earning_date),
    amount,
    currency: asString(raw.currency),
  };
}

async function loadLedger(params: GenerateStatementsParams) {
  let runIds: string[] = [];

  if (params.allocationRunId) {
    runIds = [params.allocationRunId];
  } else {
    const { data: runs, error: runsError } = await supabaseAdmin
      .from("allocation_runs")
      .select("id, import_job_id, created_at, status")
      .eq("company_id", params.companyId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(500);

    if (runsError) {
      throw new Error(`Failed to load allocation runs: ${runsError.message}`);
    }

    const latestPerImportJob = new Map<string, string>();
    for (const run of runs ?? []) {
      const importJobId = asString((run as Record<string, unknown>).import_job_id);
      const runId = asString((run as Record<string, unknown>).id);
      if (!importJobId || !runId) continue;
      if (!latestPerImportJob.has(importJobId)) {
        latestPerImportJob.set(importJobId, runId);
      }
    }

    runIds = Array.from(latestPerImportJob.values());
  }

  if (runIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("allocation_run_lines")
    .select("id, company_id, party_id, work_id, allocated_amount, currency, allocation_run_id")
    .eq("company_id", params.companyId)
    .in("allocation_run_id", runIds);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map(normalizeRow)
    .filter((r): r is AllocationLedgerRow => r !== null);
}

export async function generateStatements(
  params: GenerateStatementsParams
): Promise<GeneratedStatementResult> {
  const rows = await loadLedger(params);

  const usable = rows.filter(
    (r) => r.party_id && r.amount !== 0
  );

  if (!usable.length) {
    return { statementIds: [], count: 0 };
  }

  const byParty = new Map<string, AllocationLedgerRow[]>();

  for (const row of usable) {
    const list = byParty.get(row.party_id) ?? [];
    list.push(row);
    byParty.set(row.party_id, list);
  }

  const statementIds: string[] = [];

  for (const [partyId, partyRows] of byParty.entries()) {
    const total = round2(
      partyRows.reduce((sum, r) => sum + r.amount, 0)
    );

    const { data: statement, error } = await supabaseAdmin
      .from("statements")
      .insert({
        company_id: params.companyId,
        party_id: partyId,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        status: "draft",
        total_amount: total,
        currency: partyRows[0].currency ?? null,
        generated_from: "allocation",
        created_by: params.createdBy ?? null,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    const statementId = statement.id;
    statementIds.push(statementId);

    // Ledger rows
    await supabaseAdmin.from("statement_ledger").insert(
      partyRows.map((r) => ({
        statement_id: statementId,
        allocation_row_id: r.id,
        work_id: r.work_id,
        earning_date: r.earning_date,
        amount: r.amount,
        currency: r.currency,
      }))
    );

    // Line aggregation (per work)
    const byWork = new Map<string, AllocationLedgerRow[]>();

    for (const r of partyRows) {
      const key = r.work_id ?? "unknown";
      const list = byWork.get(key) ?? [];
      list.push(r);
      byWork.set(key, list);
    }

    await supabaseAdmin.from("statement_lines").insert(
      Array.from(byWork.entries()).map(([workId, rows]) => ({
        statement_id: statementId,
        line_label: workId === "unknown" ? "Unknown work" : workId,
        work_title: workId,
        row_count: rows.length,
        amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
        currency: rows[0].currency ?? null,
      }))
    );
  }

  await createAuditEvent({
    companyId: params.companyId,
    entityType: "statement_batch",
    entityId: "generate",
    action: "statements.generated",
    payload: {
      count: statementIds.length,
      period_start: params.periodStart,
      period_end: params.periodEnd,
    },
    createdBy: params.createdBy ?? null,
  });

  return {
    statementIds,
    count: statementIds.length,
  };
}