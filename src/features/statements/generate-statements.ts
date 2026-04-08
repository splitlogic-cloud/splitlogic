import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";

export type GenerateStatementsParams = {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  createdBy?: string | null;
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

type StatementLedgerGroup = {
  partyId: string;
  currency: string | null;
  rows: AllocationLedgerRow[];
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

function normalizeRow(raw: Record<string, unknown>): AllocationLedgerRow | null {
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
  const { data, error } = await supabaseAdmin
    .from("allocation_run_lines")
    .select("id, company_id, party_id, work_id, earning_date, allocated_amount, currency")
    .eq("company_id", params.companyId)
    .gte("earning_date", params.periodStart)
    .lte("earning_date", params.periodEnd);

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

  const byPartyCurrency = new Map<string, StatementLedgerGroup>();

  for (const row of usable) {
    const currency = row.currency ?? null;
    const key = `${row.party_id}::${currency ?? "__NULL__"}`;
    const group = byPartyCurrency.get(key) ?? {
      partyId: row.party_id,
      currency,
      rows: [],
    };
    group.rows.push(row);
    byPartyCurrency.set(key, group);
  }

  const statementIds: string[] = [];

  for (const group of byPartyCurrency.values()) {
    const partyRows = group.rows;
    const total = round2(
      partyRows.reduce((sum, r) => sum + r.amount, 0)
    );

    const { data: statement, error } = await supabaseAdmin
      .from("statements")
      .insert({
        company_id: params.companyId,
        party_id: group.partyId,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        status: "draft",
        total_amount: total,
        currency: group.currency,
        generated_from: "allocation",
        created_by: params.createdBy ?? null,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    const statementId = statement.id;
    statementIds.push(statementId);

    // Ledger rows
    const { error: ledgerInsertError } = await supabaseAdmin
      .from("statement_ledger")
      .insert(
        partyRows.map((r) => ({
          statement_id: statementId,
          allocation_row_id: r.id,
          work_id: r.work_id,
          earning_date: r.earning_date,
          amount: r.amount,
          currency: r.currency,
        }))
      );

    if (ledgerInsertError) {
      throw new Error(`Failed to insert statement ledger rows: ${ledgerInsertError.message}`);
    }

    // Line aggregation (per work)
    const byWork = new Map<string, AllocationLedgerRow[]>();

    for (const r of partyRows) {
      const key = r.work_id ?? "unknown";
      const list = byWork.get(key) ?? [];
      list.push(r);
      byWork.set(key, list);
    }

    const { error: linesInsertError } = await supabaseAdmin
      .from("statement_lines")
      .insert(
        Array.from(byWork.entries()).map(([workId, rows]) => ({
          statement_id: statementId,
          line_label: workId === "unknown" ? "Unknown work" : workId,
          work_title: workId,
          row_count: rows.length,
          amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
          currency: rows[0].currency ?? null,
        }))
      );

    if (linesInsertError) {
      throw new Error(`Failed to insert statement lines: ${linesInsertError.message}`);
    }
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