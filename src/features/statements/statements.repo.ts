import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";

export type StatementStatus = "draft" | "sent" | "paid" | "void" | "voided";

export type StatementListRow = {
  id: string;
  company_id: string;
  party_id?: string | null;
  allocation_run_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  status?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;
  note?: string | null;
  export_hash?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  party_name?: string | null;
  currency?: string | null;
  total_amount?: number | null;
};

export type StatementHeader = StatementListRow;

export type StatementLine = {
  id: string;
  statement_id: string;
  allocation_row_id: string;
  import_row_id: string;
  work_id: string;
  party_id: string;
  source_amount: number;
  share_percent: number;
  allocated_amount: number;
  currency: string | null;
  work_title?: string | null;
};

export type GenerateStatementResult = {
  createdCount: number;
  statementIds: string[];
};

function clampLimit(n: number, min = 1, max = 500) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function listStatementsByCompany(
  companyId: string,
  limit = 200
): Promise<StatementListRow[]> {
  const safeLimit = clampLimit(limit);

  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(
      "id, company_id, party_id, allocation_run_id, period_start, period_end, status, sent_at, paid_at, voided_at, note, export_hash, created_at, created_by, total_amount"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(`listStatementsByCompany failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    company_id: string;
    party_id?: string | null;
    allocation_run_id?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    status?: string | null;
    sent_at?: string | null;
    paid_at?: string | null;
    voided_at?: string | null;
    note?: string | null;
    export_hash?: string | null;
    created_at?: string | null;
    created_by?: string | null;
    total_amount?: string | number | null;
  }>;

  const partyIds = Array.from(
    new Set(rows.map((row) => row.party_id).filter(Boolean))
  ) as string[];

  let partyMap = new Map<string, string>();

  if (partyIds.length > 0) {
    const { data: parties, error: partiesError } = await supabaseAdmin
      .from("parties")
      .select("id, name")
      .in("id", partyIds);

    if (partiesError) {
      throw new Error(
        `listStatementsByCompany parties failed: ${partiesError.message}`
      );
    }

    partyMap = new Map<string, string>();
    for (const party of parties ?? []) {
      partyMap.set(
        String(party.id),
        typeof party.name === "string" && party.name.trim() !== ""
          ? party.name
          : "Unnamed party"
      );
    }
  }

  return rows.map((row) => ({
    id: row.id,
    company_id: row.company_id,
    party_id: row.party_id ?? null,
    allocation_run_id: row.allocation_run_id ?? null,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    status: row.status ?? null,
    sent_at: row.sent_at ?? null,
    paid_at: row.paid_at ?? null,
    voided_at: row.voided_at ?? null,
    note: row.note ?? null,
    export_hash: row.export_hash ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    party_name: row.party_id ? partyMap.get(row.party_id) ?? "Unnamed party" : null,
    currency: null,
    total_amount: row.total_amount != null ? round6(toNumber(row.total_amount)) : 0,
  }));
}

export async function getStatementHeader(
  companyId: string,
  statementId: string
): Promise<StatementHeader | null> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(
      "id, company_id, party_id, allocation_run_id, period_start, period_end, status, sent_at, paid_at, voided_at, note, export_hash, created_at, created_by, total_amount"
    )
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) {
    throw new Error(`getStatementHeader failed: ${error.message}`);
  }

  if (!data) return null;

  const row = data as {
    id: string;
    company_id: string;
    party_id?: string | null;
    allocation_run_id?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    status?: string | null;
    sent_at?: string | null;
    paid_at?: string | null;
    voided_at?: string | null;
    note?: string | null;
    export_hash?: string | null;
    created_at?: string | null;
    created_by?: string | null;
    total_amount?: string | number | null;
  };

  let partyName: string | null = null;

  if (row.party_id) {
    const { data: party, error: partyError } = await supabaseAdmin
      .from("parties")
      .select("name")
      .eq("id", row.party_id)
      .maybeSingle();

    if (partyError) {
      throw new Error(`getStatementHeader party failed: ${partyError.message}`);
    }

    partyName =
      typeof party?.name === "string" && party.name.trim() !== ""
        ? party.name
        : "Unnamed party";
  }

  return {
    id: row.id,
    company_id: row.company_id,
    party_id: row.party_id ?? null,
    allocation_run_id: row.allocation_run_id ?? null,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    status: row.status ?? null,
    sent_at: row.sent_at ?? null,
    paid_at: row.paid_at ?? null,
    voided_at: row.voided_at ?? null,
    note: row.note ?? null,
    export_hash: row.export_hash ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    party_name: partyName,
    currency: null,
    total_amount: row.total_amount != null ? round6(toNumber(row.total_amount)) : 0,
  };
}

export async function listStatementLines(
  companyId: string,
  statementId: string
): Promise<StatementLine[]> {
  const { data: statement, error: statementError } = await supabaseAdmin
    .from("statements")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (statementError) {
    throw new Error(
      `listStatementLines statement check failed: ${statementError.message}`
    );
  }

  if (!statement) return [];

  const { data, error } = await supabaseAdmin
    .from("statement_lines")
    .select(
      "id, statement_id, allocation_row_id, import_row_id, work_id, party_id, source_amount, share_percent, allocated_amount, currency"
    )
    .eq("statement_id", statementId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`listStatementLines failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    statement_id: string;
    allocation_row_id: string;
    import_row_id: string;
    work_id: string;
    party_id: string;
    source_amount: string | number;
    share_percent: string | number;
    allocated_amount: string | number;
    currency: string | null;
  }>;

  const workIds = Array.from(new Set(rows.map((row) => row.work_id))).filter(Boolean);

  let workMap = new Map<string, string>();

  if (workIds.length > 0) {
    const { data: works, error: worksError } = await supabaseAdmin
      .from("works")
      .select("id, title")
      .in("id", workIds);

    if (worksError) {
      throw new Error(`listStatementLines works failed: ${worksError.message}`);
    }

    workMap = new Map<string, string>();
    for (const work of works ?? []) {
      workMap.set(
        String(work.id),
        typeof work.title === "string" && work.title.trim() !== ""
          ? work.title
          : "Untitled work"
      );
    }
  }

  return rows.map((row) => ({
    id: row.id,
    statement_id: row.statement_id,
    allocation_row_id: row.allocation_row_id,
    import_row_id: row.import_row_id,
    work_id: row.work_id,
    party_id: row.party_id,
    source_amount: round6(toNumber(row.source_amount)),
    share_percent: round6(toNumber(row.share_percent)),
    allocated_amount: round6(toNumber(row.allocated_amount)),
    currency: row.currency ?? null,
    work_title: workMap.get(row.work_id) ?? "Untitled work",
  }));
}

export async function generateStatementsFromAllocationRun(params: {
  companyId: string;
  allocationRunId: string;
  createdBy?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<GenerateStatementResult> {
  const { data: allocationRows, error: allocationRowsError } = await supabaseAdmin
    .from("allocation_rows")
    .select(
      "id, import_row_id, work_id, party_id, source_amount, share_percent, allocated_amount, currency"
    )
    .eq("allocation_run_id", params.allocationRunId);

  if (allocationRowsError) {
    throw new Error(
      `generateStatementsFromAllocationRun load allocation_rows failed: ${allocationRowsError.message}`
    );
  }

  const rows = (allocationRows ?? []) as Array<{
    id: string;
    import_row_id: string;
    work_id: string;
    party_id: string;
    source_amount: string | number;
    share_percent: string | number;
    allocated_amount: string | number;
    currency: string | null;
  }>;

  if (rows.length === 0) {
    return {
      createdCount: 0,
      statementIds: [],
    };
  }

  const rowsByParty = new Map<string, typeof rows>();

  for (const row of rows) {
    const current = rowsByParty.get(row.party_id) ?? [];
    current.push(row);
    rowsByParty.set(row.party_id, current);
  }

  const statementIds: string[] = [];

  for (const [partyId, partyRows] of rowsByParty.entries()) {
    const totalAmount = round6(
      partyRows.reduce((sum, row) => sum + toNumber(row.allocated_amount), 0)
    );

    const currencies = Array.from(
      new Set(
        partyRows
          .map((row) => row.currency)
          .filter((value): value is string => typeof value === "string" && value.trim() !== "")
      )
    );

    const derivedCurrency = currencies.length === 1 ? currencies[0] : null;

    const { data: statement, error: statementError } = await supabaseAdmin
      .from("statements")
      .insert({
        company_id: params.companyId,
        party_id: partyId,
        allocation_run_id: params.allocationRunId,
        period_start: params.periodStart ?? null,
        period_end: params.periodEnd ?? null,
        status: "draft",
        total_amount: totalAmount,
        created_by: params.createdBy ?? null,
      })
      .select("id")
      .single();

    if (statementError || !statement) {
      throw new Error(
        `generateStatementsFromAllocationRun create statement failed: ${
          statementError?.message ?? "no row"
        }`
      );
    }

    const statementId = String(statement.id);
    statementIds.push(statementId);

    const lineInserts = partyRows.map((row) => ({
      statement_id: statementId,
      allocation_row_id: row.id,
      import_row_id: row.import_row_id,
      work_id: row.work_id,
      party_id: row.party_id,
      source_amount: toNumber(row.source_amount),
      share_percent: toNumber(row.share_percent),
      allocated_amount: toNumber(row.allocated_amount),
      currency: row.currency ?? null,
    }));

    const { error: linesError } = await supabaseAdmin
      .from("statement_lines")
      .insert(lineInserts);

    if (linesError) {
      throw new Error(
        `generateStatementsFromAllocationRun create lines failed: ${linesError.message}`
      );
    }

    await createAuditEvent({
      companyId: params.companyId,
      entityType: "statement",
      entityId: statementId,
      action: "statement.created",
      payload: {
        allocationRunId: params.allocationRunId,
        partyId,
        lineCount: lineInserts.length,
        totalAmount,
        currency: derivedCurrency,
      },
      createdBy: params.createdBy ?? null,
    });
  }

  return {
    createdCount: statementIds.length,
    statementIds,
  };
}