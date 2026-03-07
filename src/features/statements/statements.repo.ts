// src/features/statements/statements.repo.ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StatementStatus = "draft" | "sent" | "paid" | "void" | "voided";

export type StatementListRow = {
  id: string;
  company_id: string;
  party_id?: string | null;
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
  party_name?: string | null;
  currency?: string | null;

  // UI helperfält om de finns i framtiden
  total_amount?: number | null;
  total_payable_amount?: number | null;
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

export type GenerateStatementResult = {
  id: string;
};

type ListFilters = {
  status?: string | null;
  q?: string | null;
  limit?: number;
};

function clampLimit(n: number, min = 1, max = 500) {
  return Math.min(Math.max(n, min), max);
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function listStatementsByCompany(
  companyId: string,
  filters: ListFilters = {}
) {
  const supabase = await createSupabaseServerClient();
  const limit = clampLimit(filters.limit ?? 200);

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

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`listStatementsByCompany: ${error.message}`);
  }

  let rows: StatementListRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    company_id: r.company_id,
    party_id: r.party_id ?? null,
    period_start: r.period_start ?? null,
    period_end: r.period_end ?? null,
    status: r.status ?? "draft",
    recoup_run_id: r.recoup_run_id ?? null,
    allocation_run_id: r.allocation_run_id ?? null,
    sent_at: r.sent_at ?? null,
    paid_at: r.paid_at ?? null,
    voided_at: r.voided_at ?? null,
    note: r.note ?? null,
    export_hash: r.export_hash ?? null,
    created_at: r.created_at ?? null,
    created_by: r.created_by ?? null,
    party_name: null,
    currency: null,
    total_amount: null,
    total_payable_amount: null,
  }));

  const q = filters.q?.trim().toLowerCase();
  if (!q) return rows;

  rows = rows.filter((r) => {
    const haystack = [
      r.id ?? "",
      r.status ?? "",
      r.period_start ?? "",
      r.period_end ?? "",
      r.note ?? "",
      r.export_hash ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
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

  if (error) {
    throw new Error(`getStatementHeader: ${error.message}`);
  }

  if (!data) {
    throw new Error("Statement not found");
  }

  const header: StatementHeader = {
    id: data.id,
    company_id: data.company_id,
    party_id: data.party_id ?? null,
    period_start: data.period_start ?? null,
    period_end: data.period_end ?? null,
    status: data.status ?? "draft",
    recoup_run_id: data.recoup_run_id ?? null,
    allocation_run_id: data.allocation_run_id ?? null,
    sent_at: data.sent_at ?? null,
    paid_at: data.paid_at ?? null,
    voided_at: data.voided_at ?? null,
    note: data.note ?? null,
    export_hash: data.export_hash ?? null,
    created_at: data.created_at ?? null,
    created_by: data.created_by ?? null,
    party_name: null,
    currency: null,
    total_amount: null,
    total_payable_amount: null,
  };

  return header;
}

export async function listStatementLines(companyId: string, statementId: string) {
  const supabase = await createSupabaseServerClient();

  // Först försöker vi läsa canonical view om den finns och stödjer company_id
  const preferred = await supabase
    .from("statement_lines_v1")
    .select(
      `
        statement_id,
        work_id,
        currency,
        gross_amount,
        payable_amount
      `
    )
    .eq("company_id", companyId)
    .eq("statement_id", statementId)
    .limit(20000);

  if (!preferred.error) {
    return (preferred.data ?? []).map((r: any, index: number) => ({
      id: `${statementId}-${index}`,
      statement_id: r.statement_id,
      work_id: r.work_id ?? null,
      work_title: null,
      territory: null,
      currency: r.currency ?? "SEK",
      amount: toNumber(r.payable_amount ?? r.gross_amount ?? 0),
      created_at: null,
    })) as StatementLine[];
  }

  // Fallback till tabell om view inte finns eller inte fungerar
  const fallback = await supabase
    .from("statement_lines")
    .select(
      `
        id,
        statement_id,
        work_id,
        work_title,
        country_code,
        currency,
        amount,
        created_at
      `
    )
    .eq("statement_id", statementId)
    .limit(20000);

  if (fallback.error) {
    throw new Error(`listStatementLines: ${fallback.error.message}`);
  }

  return (fallback.data ?? []).map((r: any) => ({
    id: r.id,
    statement_id: r.statement_id,
    work_id: r.work_id ?? null,
    work_title: r.work_title ?? null,
    territory: r.country_code ?? null,
    currency: r.currency ?? "SEK",
    amount: toNumber(r.amount),
    created_at: r.created_at ?? null,
  })) as StatementLine[];
}

/**
 * Skapa statement via DB RPC (generate_statement)
 * RPC:n returnerar statement_id.
 */
export async function generateStatement(params: {
  companyId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  amountField?: "net" | "gross";
}): Promise<GenerateStatementResult> {
  const supabase = await createSupabaseServerClient();

  const { companyId, periodStart, periodEnd, amountField = "net" } = params;

  const { data, error } = await supabase.rpc("generate_statement", {
    p_company_id: companyId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_amount_field: amountField,
  });

  if (error) {
    throw new Error(`generateStatement: ${error.message}`);
  }

  if (!data || typeof data !== "string") {
    throw new Error("generateStatement: RPC did not return a valid statement id");
  }

  return { id: data };
}

export async function setStatementStatus(
  companyId: string,
  statementId: string,
  status: StatementStatus
) {
  const supabase = await createSupabaseServerClient();

  const rpcTry = await supabase.rpc("statement_set_status", {
    p_company_id: companyId,
    p_statement_id: statementId,
    p_status: status,
  });

  if (!rpcTry.error) {
    return;
  }

  const { error } = await supabase
    .from("statements")
    .update({ status })
    .eq("company_id", companyId)
    .eq("id", statementId);

  if (error) {
    throw new Error(`setStatementStatus: ${error.message}`);
  }
}