import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

type GenerateStatementsInput = {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  note?: string | null;
};

type AllocationLedgerRow = {
  id: string;
  company_id: string;
  party_id: string | null;
  work_id: string | null;
  allocated_amount: number | string | null;
  currency: string | null;
  earning_date: string | null;
  period_start: string | null;
  period_end: string | null;
};

type PartyRecord = {
  id: string;
  name: string | null;
};

type WorkRecord = {
  id: string;
  title: string | null;
};

export type GeneratedStatementResult = {
  statementId: string;
  partyId: string;
  partyName: string;
  totalAmount: number;
  currency: string | null;
  lineCount: number;
  sourceRowCount: number;
};

function asNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function assertIsoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

function getStatementCurrency(rows: AllocationLedgerRow[]): string | null {
  const set = new Set(
    rows.map((row) => (row.currency ?? "").trim()).filter(Boolean),
  );

  if (set.size === 0) return null;
  if (set.size === 1) return Array.from(set)[0] ?? null;

  return null;
}

export async function generateStatementsFromLedger(
  input: GenerateStatementsInput,
): Promise<GeneratedStatementResult[]> {
  const { companyId, periodStart, periodEnd, note } = input;

  if (!companyId) {
    throw new Error("Missing companyId");
  }

  assertIsoDate(periodStart, "periodStart");
  assertIsoDate(periodEnd, "periodEnd");

  if (periodStart > periodEnd) {
    throw new Error("periodStart cannot be after periodEnd");
  }

  const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
    .from("allocation_rows")
    .select(
      [
        "id",
        "company_id",
        "party_id",
        "work_id",
        "allocated_amount",
        "currency",
        "earning_date",
        "period_start",
        "period_end",
      ].join(","),
    )
    .eq("company_id", companyId)
    .not("party_id", "is", null)
    .gte("earning_date", periodStart)
    .lte("earning_date", periodEnd);

  if (ledgerError) {
    throw new Error(`Failed to load allocation_rows: ${ledgerError.message}`);
  }

  const usableRows = (ledgerRows ?? []).filter(
    (row): row is AllocationLedgerRow =>
      !!row &&
      !!row.id &&
      !!row.company_id &&
      !!row.party_id &&
      asNumber(row.allocated_amount) !== 0,
  );

  if (usableRows.length === 0) {
    return [];
  }

  const partyIds = Array.from(
    new Set(usableRows.map((row) => row.party_id).filter(Boolean) as string[]),
  );

  const workIds = Array.from(
    new Set(usableRows.map((row) => row.work_id).filter(Boolean) as string[]),
  );

  const { data: parties, error: partiesError } = await supabaseAdmin
    .from("parties")
    .select("id,name")
    .in("id", partyIds);

  if (partiesError) {
    throw new Error(`Failed to load parties: ${partiesError.message}`);
  }

  let works: WorkRecord[] = [];
  if (workIds.length > 0) {
    const { data: worksData, error: worksError } = await supabaseAdmin
      .from("works")
      .select("id,title")
      .in("id", workIds);

    if (worksError) {
      throw new Error(`Failed to load works: ${worksError.message}`);
    }

    works = (worksData ?? []) as WorkRecord[];
  }

  const partyMap = new Map<string, PartyRecord>(
    ((parties ?? []) as PartyRecord[]).map((party) => [party.id, party]),
  );

  const workMap = new Map<string, WorkRecord>(
    works.map((work) => [work.id, work]),
  );

  const rowsByParty = new Map<string, AllocationLedgerRow[]>();

  for (const row of usableRows) {
    const partyId = row.party_id!;
    const bucket = rowsByParty.get(partyId) ?? [];
    bucket.push(row);
    rowsByParty.set(partyId, bucket);
  }

  const results: GeneratedStatementResult[] = [];

  for (const [partyId, partyRows] of rowsByParty.entries()) {
    const party = partyMap.get(partyId);
    const partyName = party?.name?.trim() || "Unknown party";
    const currency = getStatementCurrency(partyRows);

    const totalAmount = partyRows.reduce(
      (sum, row) => sum + asNumber(row.allocated_amount),
      0,
    );

    const { data: existingDraft, error: existingDraftError } = await supabaseAdmin
      .from("statements")
      .select("id")
      .eq("company_id", companyId)
      .eq("party_id", partyId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .eq("status", "draft")
      .maybeSingle();

    if (existingDraftError) {
      throw new Error(
        `Failed to check existing draft statements: ${existingDraftError.message}`,
      );
    }

    if (existingDraft?.id) {
      const { error: deleteBridgeError } = await supabaseAdmin
        .from("statement_allocation_rows")
        .delete()
        .eq("statement_id", existingDraft.id);

      if (deleteBridgeError) {
        throw new Error(
          `Failed to delete old statement allocation rows: ${deleteBridgeError.message}`,
        );
      }

      const { error: deleteLinesError } = await supabaseAdmin
        .from("statement_lines")
        .delete()
        .eq("statement_id", existingDraft.id);

      if (deleteLinesError) {
        throw new Error(
          `Failed to delete old statement lines: ${deleteLinesError.message}`,
        );
      }

      const { error: deleteStatementError } = await supabaseAdmin
        .from("statements")
        .delete()
        .eq("id", existingDraft.id);

      if (deleteStatementError) {
        throw new Error(
          `Failed to delete old statement draft: ${deleteStatementError.message}`,
        );
      }
    }

    const { data: insertedStatement, error: insertStatementError } =
      await supabaseAdmin
        .from("statements")
        .insert({
          company_id: companyId,
          party_id: partyId,
          period_start: periodStart,
          period_end: periodEnd,
          status: "draft",
          note: note ?? null,
          total_amount: totalAmount,
          currency,
          generated_from: "period",
        })
        .select("id")
        .single();

    if (insertStatementError || !insertedStatement) {
      throw new Error(
        `Failed to create statement for ${partyName}: ${insertStatementError?.message ?? "Unknown error"}`,
      );
    }

    const statementId = insertedStatement.id as string;

    const rowsByWork = new Map<string, AllocationLedgerRow[]>();
    const noWorkRows: AllocationLedgerRow[] = [];

    for (const row of partyRows) {
      if (row.work_id) {
        const bucket = rowsByWork.get(row.work_id) ?? [];
        bucket.push(row);
        rowsByWork.set(row.work_id, bucket);
      } else {
        noWorkRows.push(row);
      }
    }

    const statementLineIdByAllocationRowId = new Map<string, string>();
    let lineCount = 0;

    for (const [workId, workRows] of rowsByWork.entries()) {
      const work = workMap.get(workId);
      const lineLabel = work?.title?.trim() || `Work ${workId.slice(0, 8)}`;
      const amount = workRows.reduce(
        (sum, row) => sum + asNumber(row.allocated_amount),
        0,
      );

      const lineCurrency = getStatementCurrency(workRows);

      const { data: insertedLine, error: insertLineError } = await supabaseAdmin
        .from("statement_lines")
        .insert({
          statement_id: statementId,
          company_id: companyId,
          party_id: partyId,
          work_id: workId,
          line_label: lineLabel,
          amount,
          currency: lineCurrency,
          row_count: workRows.length,
        })
        .select("id")
        .single();

      if (insertLineError || !insertedLine) {
        throw new Error(
          `Failed to create statement line for ${partyName}: ${insertLineError?.message ?? "Unknown error"}`,
        );
      }

      lineCount += 1;

      for (const row of workRows) {
        statementLineIdByAllocationRowId.set(row.id, insertedLine.id as string);
      }
    }

    if (noWorkRows.length > 0) {
      const amount = noWorkRows.reduce(
        (sum, row) => sum + asNumber(row.allocated_amount),
        0,
      );

      const lineCurrency = getStatementCurrency(noWorkRows);

      const { data: insertedLine, error: insertLineError } = await supabaseAdmin
        .from("statement_lines")
        .insert({
          statement_id: statementId,
          company_id: companyId,
          party_id: partyId,
          work_id: null,
          line_label: "Unassigned / unmatched work",
          amount,
          currency: lineCurrency,
          row_count: noWorkRows.length,
        })
        .select("id")
        .single();

      if (insertLineError || !insertedLine) {
        throw new Error(
          `Failed to create unmatched statement line for ${partyName}: ${insertLineError?.message ?? "Unknown error"}`,
        );
      }

      lineCount += 1;

      for (const row of noWorkRows) {
        statementLineIdByAllocationRowId.set(row.id, insertedLine.id as string);
      }
    }

    const bridgeRows = partyRows.map((row) => ({
      statement_id: statementId,
      statement_line_id: statementLineIdByAllocationRowId.get(row.id) ?? null,
      allocation_row_id: row.id,
      company_id: companyId,
      party_id: partyId,
    }));

    const { error: bridgeError } = await supabaseAdmin
      .from("statement_allocation_rows")
      .insert(bridgeRows);

    if (bridgeError) {
      throw new Error(
        `Failed to link allocation rows to statement for ${partyName}: ${bridgeError.message}`,
      );
    }

    results.push({
      statementId,
      partyId,
      partyName,
      totalAmount,
      currency,
      lineCount,
      sourceRowCount: partyRows.length,
    });
  }

  return results.sort((a, b) => a.partyName.localeCompare(b.partyName));
}