import "server-only";

import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type GenerateStatementsParams = {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  partyId?: string | null;
};

export type GeneratedStatementResult = {
  runId: string;
  statementIds: string[];
  count: number;
};

type AllocationRow = {
  id: string;
  import_row_id: string | null;
  work_id: string | null;
  party_id: string | null;
  allocated_amount: number | null;
  currency: string | null;
  import_rows: {
    id: string | null;
    raw_title: string | null;
    artist: string | null;
    isrc: string | null;
    platform: string | null;
    territory: string | null;
    transaction_date: string | null;
  } | null;
};

type StatementLineInsert = {
  statement_id: string;
  allocation_line_id: string;
  import_row_id: string;
  work_id: string;
  party_id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  platform: string | null;
  territory: string | null;
  transaction_date: string | null;
  amount: number;
  currency: string;
  units: number | null;
};

function normalizeMoney(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function assertDateInput(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} is not a valid date`);
  }
}

function toImportRow(input: unknown): AllocationRow["import_rows"] {
  if (!input) return null;
  if (Array.isArray(input)) {
    return (input[0] as AllocationRow["import_rows"]) ?? null;
  }
  return input as AllocationRow["import_rows"];
}

function chunk<T>(rows: T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

export async function generateStatements(
  params: GenerateStatementsParams
): Promise<GeneratedStatementResult> {
  if (!params.companyId) {
    throw new Error("companyId is required");
  }
  assertDateInput(params.periodStart, "periodStart");
  assertDateInput(params.periodEnd, "periodEnd");

  if (params.periodStart > params.periodEnd) {
    throw new Error("periodStart cannot be later than periodEnd");
  }

  let query = supabaseAdmin
    .from("allocation_lines")
    .select(
      `
      id,
      import_row_id,
      work_id,
      party_id,
      allocated_amount,
      currency,
      import_rows!inner(
        id,
        raw_title,
        artist,
        isrc,
        platform,
        territory,
        transaction_date
      )
    `
    )
    .eq("company_id", params.companyId)
    .gte("import_rows.transaction_date", params.periodStart)
    .lte("import_rows.transaction_date", params.periodEnd);

  if (params.partyId) {
    query = query.eq("party_id", params.partyId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load allocation lines for statements: ${error.message}`);
  }

  const rows: AllocationRow[] = (data ?? []).map((row) => ({
    id: String(row.id),
    import_row_id: row.import_row_id ? String(row.import_row_id) : null,
    work_id: row.work_id ? String(row.work_id) : null,
    party_id: row.party_id ? String(row.party_id) : null,
    allocated_amount:
      row.allocated_amount == null ? null : Number(row.allocated_amount),
    currency: row.currency ? String(row.currency) : null,
    import_rows: toImportRow(row.import_rows),
  }));

  if (!rows.length) {
    throw new Error("No allocation rows found for selected period.");
  }

  const filteredRows = rows.filter(
    (row) => Math.abs(Number(row.allocated_amount ?? 0)) > 0.0000001
  );

  if (!filteredRows.length) {
    throw new Error("No non-zero allocation rows found for selected period.");
  }

  const invalidRows = filteredRows.filter((row) => {
    if (!row.import_row_id || !row.work_id || !row.party_id || !row.currency) {
      return true;
    }
    if (row.allocated_amount == null || !Number.isFinite(Number(row.allocated_amount))) {
      return true;
    }
    return false;
  });

  if (invalidRows.length > 0) {
    throw new Error(
      `Allocation rows missing required fields (party_id, currency, work_id, import_row_id, allocated_amount): ${invalidRows.length}`
    );
  }

  const hashPayload = filteredRows
    .map((row) => [row.id, row.party_id, row.currency, row.work_id, row.allocated_amount])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const inputHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(hashPayload))
    .digest("hex");

  const { data: run, error: runError } = await supabaseAdmin
    .from("statement_runs")
    .insert({
      company_id: params.companyId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      status: "processing",
      input_row_count: filteredRows.length,
      input_hash: inputHash,
    })
    .select("id")
    .single();

  if (runError || !run?.id) {
    throw new Error(`Failed to create statement run: ${runError?.message ?? "Unknown error"}`);
  }

  const runId = String(run.id);

  try {
    const groups = new Map<string, AllocationRow[]>();
    for (const row of filteredRows) {
      const key = `${row.party_id}__${row.currency}`;
      const current = groups.get(key) ?? [];
      current.push(row);
      groups.set(key, current);
    }

    const statementIds: string[] = [];
    let totalAmount = 0;

    for (const groupRows of groups.values()) {
      const partyId = groupRows[0].party_id as string;
      const currency = groupRows[0].currency as string;
      const statementTotal = normalizeMoney(
        groupRows.reduce(
          (sum, row) => sum + Number(row.allocated_amount ?? 0),
          0
        )
      );

      const { data: statement, error: statementError } = await supabaseAdmin
        .from("statements")
        .insert({
          company_id: params.companyId,
          statement_run_id: runId,
          party_id: partyId,
          period_start: params.periodStart,
          period_end: params.periodEnd,
          currency,
          total_amount: statementTotal,
          line_count: groupRows.length,
          status: "draft",
        })
        .select("id")
        .single();

      if (statementError || !statement?.id) {
        throw new Error(
          `Failed to create statement: ${statementError?.message ?? "Unknown error"}`
        );
      }

      const statementId = String(statement.id);
      statementIds.push(statementId);
      totalAmount = normalizeMoney(totalAmount + statementTotal);

      const lines: StatementLineInsert[] = groupRows.map((row) => ({
        statement_id: statementId,
        allocation_line_id: row.id,
        import_row_id: row.import_row_id as string,
        work_id: row.work_id as string,
        party_id: row.party_id as string,
        title: row.import_rows?.raw_title ?? null,
        artist: row.import_rows?.artist ?? null,
        isrc: row.import_rows?.isrc ?? null,
        platform: row.import_rows?.platform ?? null,
        territory: row.import_rows?.territory ?? null,
        transaction_date: row.import_rows?.transaction_date ?? null,
        amount: normalizeMoney(Number(row.allocated_amount ?? 0)),
        currency: row.currency as string,
        units: null,
      }));

      for (const linesChunk of chunk(lines, 500)) {
        const { error: lineError } = await supabaseAdmin
          .from("statement_lines")
          .insert(linesChunk);
        if (lineError) {
          throw new Error(`Failed to insert statement lines: ${lineError.message}`);
        }
      }
    }

    const { error: completeError } = await supabaseAdmin
      .from("statement_runs")
      .update({
        status: "completed",
        statement_count: statementIds.length,
        total_amount: totalAmount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (completeError) {
      throw new Error(`Failed to complete statement run: ${completeError.message}`);
    }

    return {
      runId,
      statementIds,
      count: statementIds.length,
    };
  } catch (error) {
    await supabaseAdmin
      .from("statement_runs")
      .update({
        status: "failed",
        error_message:
          error instanceof Error ? error.message : "Unknown generation error",
      })
      .eq("id", runId);

    throw error;
  }
}