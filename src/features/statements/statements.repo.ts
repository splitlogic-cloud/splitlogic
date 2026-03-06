// src/features/statements/statements.repo.ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StatementStatus = "draft" | "sent" | "paid" | "void" | "voided";

export type StatementListRow = {
  id: string;

  company_id: string;

  // finns nu (vi lade till den)
  party_id?: string | null;

  // finns nu (vi lade till dem)
  period_start?: string | null;
  period_end?: string | null;

  status?: string | null;

  recoup_run_id?: string | null;
  allocation_run_id?: string | null;

  sent_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;

  note?: string | null;
  export_hash?: string | null;

  created_at?: string | null;
  created_by?: string | null;

  // UI-komfort (vi joinar inte nu)
  party_name?: string | null;

  // valfritt om du har
  currency?: string | null;
};

export type StatementHeader = StatementListRow;

export type StatementLine = {
  id?: string;
  statement_id: string;

  work_id: string | null;
  work_title?: string | null;

  territory?: string | null;

  currency: string;
  amount: number;

  created_at?: string | null;
};

type ListFilters = {
  status?: string | null;
  q?: string | null;
  limit?: number;
};

function clampLimit(n: number, min = 1, max = 500) {
  return Math.min(Math.max(n, min), max);
}

export async function listStatementsByCompany(companyId: string, filters: ListFilters = {}) {
  const supabase = await createSupabaseServerClient();
  const limit = clampLimit(filters.limit ?? 200);

  // ✅ selecta bara kolumner vi VET finns i din statements-tabell
  let query = supabase
    .from("statements")
    .select(
      `
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      recoup_run_id,
      allocation_run_id,
      sent_at,
      paid_at,
      voided_at,
      note,
      export_hash,
      created_at,
      created_by
    `
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new Error(`listStatementsByCompany: ${error.message}`);

  let rows: StatementListRow[] = (data ?? []).map((r: any) => ({
    ...r,
    party_name: null,
  }));

  const q = filters.q?.trim().toLowerCase();
  if (!q) return rows;

  rows = rows.filter((r) => {
    const hay = [
      r.id ?? "",
      r.status ?? "",
      r.period_start ?? "",
      r.period_end ?? "",
      r.note ?? "",
      r.export_hash ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return rows;
}

export async function getStatementHeader(companyId: string, statementId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("statements")
    .select(
      `
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      recoup_run_id,
      allocation_run_id,
      sent_at,
      paid_at,
      voided_at,
      note,
      export_hash,
      created_at,
      created_by
    `
    )
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) throw new Error(`getStatementHeader: ${error.message}`);
  if (!data) throw new Error(`Statement not found`);

  const header: StatementHeader = { ...(data as any), party_name: null };
  return header;
}

export async function listStatementLines(companyId: string, statementId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("statement_lines")
    .select("id, statement_id, work_id, work_title, country_code, currency, amount, created_at")
    .eq("statement_id", statementId)
    .limit(20000);

  if (error) return [] as StatementLine[];

  return (data ?? []).map((r: any) => ({
    id: r.id,
    statement_id: r.statement_id,
    work_id: r.work_id ?? null,
    work_title: r.work_title ?? null,
    territory: r.country_code ?? null,
    currency: r.currency,
    amount: Number(r.amount ?? 0),
    created_at: r.created_at ?? null,
  })) as StatementLine[];
}

/**
 * Skapa statement via DB RPC (generate_statement)
 * Matchar din revenue_rows:
 * - event_date
 * - territory
 * - currency
 * - amount_net / amount_gross
 */
export async function generateStatement(params: {
  companyId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  amountField?: "net" | "gross";
}) {
  const supabase = await createSupabaseServerClient();

  const { companyId, periodStart, periodEnd, amountField = "net" } = params;

  const { data, error } = await supabase.rpc("generate_statement", {
    p_company_id: companyId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_amount_field: amountField,
  });

  if (error) throw new Error(`generateStatement: ${error.message}`);

  return data as string; // statement_id
}

export async function setStatementStatus(companyId: string, statementId: string, status: StatementStatus) {
  const supabase = await createSupabaseServerClient();

  // 1) RPC om den finns
  const rpcTry = await supabase.rpc("statement_set_status", {
    p_company_id: companyId,
    p_statement_id: statementId,
    p_status: status,
  });

  if (!rpcTry.error) return;

  // 2) fallback update
  const { error } = await supabase
    .from("statements")
    .update({ status })
    .eq("company_id", companyId)
    .eq("id", statementId);

  if (error) throw new Error(`setStatementStatus: ${error.message}`);
}