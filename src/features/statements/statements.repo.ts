import "server-only";

import { createClient } from "@/lib/supabase/server";

export type StatementStatus = "draft" | "sent" | "paid" | "void" | "voided";

export type StatementRow = {
  id: string;
  company_id: string;
  party_id?: string | null;

  period_start?: string | null;
  period_end?: string | null;

  status?: StatementStatus | null;
  currency?: string | null;
  note?: string | null;

  generated_from?: string | null;
  generated_by?: string | null;

  allocation_run_id?: string | null;
  recoup_run_id?: string | null;

  sent_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};

export type StatementHeaderRow = StatementRow & {
  party_name?: string | null;
  total_amount?: number | null;
};

export type StatementLineRow = {
  id: string;
  statement_id: string;

  party_id?: string | null;
  party_name?: string | null;

  release_id?: string | null;
  release_title?: string | null;

  work_id?: string | null;
  work_title?: string | null;

  source_amount?: number | null;
  share_percent?: number | null;
  allocated_amount?: number | null;

  currency?: string | null;
  note?: string | null;

  created_at?: string | null;
};

export type StatementDetailRow = StatementHeaderRow & {
  lines: StatementLineRow[];
};

export type StatementWithLines = {
  header: StatementHeaderRow;
  lines: StatementLineRow[];
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadPartyMapByIds(partyIds: string[]) {
  const supabase = await createClient();

  if (!partyIds.length) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("parties")
    .select("id, name")
    .in("id", partyIds);

  if (error) {
    throw new Error(`load parties failed: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((party) => [String(party.id), String(party.name ?? "")]),
  );
}

export async function listStatementsByCompany(
  companyId: string,
): Promise<StatementHeaderRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("statements")
    .select(`
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      note,
      generated_from,
      generated_by,
      allocation_run_id,
      recoup_run_id,
      sent_at,
      paid_at,
      voided_at,
      created_at,
      updated_at
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listStatementsByCompany failed: ${error.message}`);
  }

  const rows = (data ?? []) as StatementRow[];

  const partyIds = Array.from(
    new Set(rows.map((row) => row.party_id).filter(Boolean)),
  ) as string[];

  const partyMap = await loadPartyMapByIds(partyIds);

  const statementIds = rows.map((row) => row.id);
  const totalsMap = new Map<string, number>();

  if (statementIds.length > 0) {
    const { data: lines, error: linesError } = await supabase
      .from("statement_lines")
      .select("statement_id, allocated_amount")
      .in("statement_id", statementIds);

    if (linesError) {
      throw new Error(`load statement lines failed: ${linesError.message}`);
    }

    for (const line of lines ?? []) {
      const statementId = String(line.statement_id ?? "");
      const amount = toNumberOrNull(line.allocated_amount) ?? 0;
      totalsMap.set(statementId, (totalsMap.get(statementId) ?? 0) + amount);
    }
  }

  return rows.map((row) => ({
    ...row,
    party_name: row.party_id ? (partyMap.get(row.party_id) ?? null) : null,
    total_amount: totalsMap.get(row.id) ?? 0,
  }));
}

export async function getStatementHeader(
  companyId: string,
  statementId: string,
): Promise<StatementHeaderRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("statements")
    .select(`
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      note,
      generated_from,
      generated_by,
      allocation_run_id,
      recoup_run_id,
      sent_at,
      paid_at,
      voided_at,
      created_at,
      updated_at
    `)
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) {
    throw new Error(`getStatementHeader failed: ${error.message}`);
  }

  if (!data) return null;

  let partyName: string | null = null;

  if (data.party_id) {
    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("id, name")
      .eq("id", data.party_id)
      .maybeSingle();

    if (partyError) {
      throw new Error(`load statement party failed: ${partyError.message}`);
    }

    partyName = (party?.name as string | undefined) ?? null;
  }

  const { data: lines, error: linesError } = await supabase
    .from("statement_lines")
    .select("allocated_amount")
    .eq("statement_id", statementId);

  if (linesError) {
    throw new Error(`load statement total failed: ${linesError.message}`);
  }

  const totalAmount = (lines ?? []).reduce((sum, line) => {
    return sum + (toNumberOrNull(line.allocated_amount) ?? 0);
  }, 0);

  return {
    ...(data as StatementRow),
    party_name: partyName,
    total_amount: totalAmount,
  };
}

export async function listStatementLines(
  statementId: string,
): Promise<StatementLineRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("statement_lines")
    .select(`
      id,
      statement_id,
      party_id,
      release_id,
      release_title,
      work_id,
      work_title,
      source_amount,
      share_percent,
      allocated_amount,
      currency,
      note,
      created_at
    `)
    .eq("statement_id", statementId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`listStatementLines failed: ${error.message}`);
  }

  const rows = (data ?? []) as StatementLineRow[];

  const partyIds = Array.from(
    new Set(rows.map((row) => row.party_id).filter(Boolean)),
  ) as string[];

  const partyMap = await loadPartyMapByIds(partyIds);

  return rows.map((row) => ({
    ...row,
    party_name: row.party_id ? (partyMap.get(row.party_id) ?? null) : null,
  }));
}

export async function getStatementById(
  companyId: string,
  statementId: string,
): Promise<StatementDetailRow | null> {
  const header = await getStatementHeader(companyId, statementId);

  if (!header) return null;

  const lines = await listStatementLines(statementId);

  return {
    ...header,
    lines,
  };
}

export async function getStatementWithLines(
  companyId: string,
  statementId: string,
): Promise<StatementWithLines> {
  const header = await getStatementHeader(companyId, statementId);

  if (!header) {
    throw new Error("Statement not found");
  }

  const lines = await listStatementLines(statementId);

  return {
    header,
    lines,
  };
}