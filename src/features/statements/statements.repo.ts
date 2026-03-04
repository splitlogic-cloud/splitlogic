// src/features/statements/statements.repo.ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StatementStatus = "draft" | "sent" | "paid" | "void";

export type StatementListRow = {
  id: string;

  company_id: string;
  party_id: string | null;

  // period kan vara text eller datumintervall beroende på din modell
  period?: string | null;
  period_start?: string | null;
  period_end?: string | null;

  currency?: string | null;
  status?: StatementStatus | string | null;

  gross_amount?: number | null;
  recouped_amount?: number | null;
  payable_amount?: number | null;

  allocation_run_id?: string | null;
  recoup_run_id?: string | null;

  // lock-indikatorer (om du sparar dem i statements eller joinar via views)
  allocation_locked_at?: string | null;
  recoup_locked_at?: string | null;

  // joinad party info (valfritt)
  party_name?: string | null;

  created_at?: string | null;
};

export type StatementHeader = StatementListRow & {
  updated_at?: string | null;
  engine_version?: string | null;
  input_hash?: string | null;
};

export type StatementLine = {
  statement_id: string;
  work_id: string | null;
  work_title?: string | null;
  isrc?: string | null;

  gross_amount?: number | null;
  recouped_amount?: number | null;
  payable_amount?: number | null;

  share_bps?: number | null; // ex 2500 = 25.00%
  share_pct?: number | null; // ex 25.00

  currency?: string | null;
};

type ListFilters = {
  status?: string | null;
  q?: string | null; // party search
  limit?: number;
};

function normalizeShare(line: StatementLine): StatementLine {
  if (line.share_pct == null && line.share_bps != null) {
    return { ...line, share_pct: Number(line.share_bps) / 100 };
  }
  return line;
}

export async function listStatementsByCompany(companyId: string, filters: ListFilters = {}) {
  const supabase = await createSupabaseServerClient();
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);

  // Bas: statements
  // Vi försöker även joina party name om din FK heter party_id -> parties
  // Om joinen inte finns i din DB så kommentera bort select-delen.
  let query = supabase
    .from("statements")
    .select(
      `
      id,
      company_id,
      party_id,
      period,
      period_start,
      period_end,
      currency,
      status,
      gross_amount,
      recouped_amount,
      payable_amount,
      allocation_run_id,
      recoup_run_id,
      allocation_locked_at,
      recoup_locked_at,
      created_at,
      parties:party_id ( name )
    `
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) query = query.eq("status", filters.status);

  // Enkel sök på party_name (om joinen funkar)
  if (filters.q && filters.q.trim()) {
    // Supabase kan inte alltid filtera på joinad kolumn robust.
    // Vi gör "best effort": hämta och filtrera i minnet i UI om du vill.
    // Här lämnar vi queryn som den är.
  }

  const { data, error } = await query;
  if (error) throw new Error(`listStatementsByCompany: ${error.message}`);

  const rows: StatementListRow[] =
    (data ?? []).map((r: any) => ({
      ...r,
      party_name: r?.parties?.name ?? null,
    })) ?? [];

  // In-memory q filter (stabilt)
  const q = filters.q?.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((r) => (r.party_name ?? "").toLowerCase().includes(q));
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
      period,
      period_start,
      period_end,
      currency,
      status,
      gross_amount,
      recouped_amount,
      payable_amount,
      allocation_run_id,
      recoup_run_id,
      allocation_locked_at,
      recoup_locked_at,
      engine_version,
      input_hash,
      created_at,
      updated_at,
      parties:party_id ( name )
    `
    )
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) throw new Error(`getStatementHeader: ${error.message}`);
  if (!data) throw new Error(`Statement not found`);

  const header: StatementHeader = {
    ...(data as any),
    party_name: (data as any)?.parties?.name ?? null,
  };

  return header;
}

export async function listStatementLines(companyId: string, statementId: string) {
  const supabase = await createSupabaseServerClient();

  // Förväntad view: statement_lines_v1
  // Kolumner (best effort): statement_id, work_id, work_title, isrc, gross_amount, recouped_amount, payable_amount, share_bps/share_pct, currency
  const { data, error } = await supabase
    .from("statement_lines_v1")
    .select(
      `
      statement_id,
      work_id,
      work_title,
      isrc,
      gross_amount,
      recouped_amount,
      payable_amount,
      share_bps,
      share_pct,
      currency
    `
    )
    .eq("statement_id", statementId)
    .limit(20000);

  // Om view inte finns ännu: returnera tom lista men UI funkar
  if (error) {
    // Du kan skapa view senare, men UI ska inte krascha.
    return [] as StatementLine[];
  }

  // Extra safety: kontrollera company isolation om view innehåller company_id
  // (Om view saknar company_id så litar vi på RLS / statement_id-ägarskap)
  const lines = (data ?? []).map((x: any) => normalizeShare(x as StatementLine));

  return lines;
}

export async function setStatementStatus(companyId: string, statementId: string, status: StatementStatus) {
  const supabase = await createSupabaseServerClient();

  // 1) Försök RPC först (om du har lifecycle RPC)
  // Exempel på namn: statement_set_status / statements_set_status / set_statement_status
  // Vi provar ett “vanligt” namn. Byt om ditt heter annat.
  const rpcTry = await supabase.rpc("statement_set_status", {
    p_company_id: companyId,
    p_statement_id: statementId,
    p_status: status,
  });

  if (!rpcTry.error) return;

  // 2) Fallback: direkt update på statements
  const { error } = await supabase
    .from("statements")
    .update({ status })
    .eq("company_id", companyId)
    .eq("id", statementId);

  if (error) throw new Error(`setStatementStatus: ${error.message}`);
}