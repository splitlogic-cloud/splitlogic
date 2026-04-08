import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type AllocationQARow = {
  allocationRowId: string;
  importRowId: string;
  workId: string;
  workTitle: string;
  partyId: string;
  partyName: string;
  sourceAmount: number;
  sharePercent: number;
  allocatedAmount: number;
  currency: string | null;
};

export type AllocationQASummary = {
  rowCount: number;
  totalAllocated: number;
  currency: string | null;
  partyCount: number;
  workCount: number;
};

export type AllocationQABlockerRow = {
  blockerId: string;
  importRowId: string | null;
  rowNumber: number | null;
  rowStatus: string | null;
  rawTitle: string | null;
  blockerCode: string;
  severity: "info" | "warning" | "error";
  message: string;
};

type AllocationRowRaw = {
  id: string;
  import_row_id: string;
  work_id: string;
  party_id: string;
  row_amount: string | number | null;
  share_bps: string | number | null;
  allocated_amount: string | number | null;
  currency: string | null;
};

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

async function loadAllocationRows(allocationRunId: string): Promise<AllocationRowRaw[]> {
  const allRows: AllocationRowRaw[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const to = from + batchSize - 1;

    const { data, error } = await supabaseAdmin
      .from("allocation_lines")
      .select(
        "id, import_row_id, work_id, party_id, row_amount, share_bps, allocated_amount, currency"
      )
      .eq("allocation_run_id", allocationRunId)
      .range(from, to);

    if (error) {
      throw new Error(`loadAllocationRows failed: ${error.message}`);
    }

    const batch = (data ?? []) as AllocationRowRaw[];
    allRows.push(...batch);

    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return allRows;
}

export async function getAllocationQASummary(params: {
  allocationRunId: string;
}): Promise<AllocationQASummary> {
  const rows = await loadAllocationRows(params.allocationRunId);

  const totalAllocated = round6(
    rows.reduce((sum, row) => sum + toNumber(row.allocated_amount), 0)
  );

  const currencies = Array.from(
    new Set(rows.map((row) => row.currency).filter(Boolean))
  ) as string[];

  return {
    rowCount: rows.length,
    totalAllocated,
    currency: currencies.length === 1 ? currencies[0] : null,
    partyCount: new Set(rows.map((row) => row.party_id)).size,
    workCount: new Set(rows.map((row) => row.work_id)).size,
  };
}

export async function listAllocationQARows(params: {
  allocationRunId: string;
  limit?: number | null;
}): Promise<AllocationQARow[]> {
  const rows = await loadAllocationRows(params.allocationRunId);
  const limitedRows =
    typeof params.limit === "number" && params.limit >= 0
      ? rows.slice(0, params.limit)
      : rows;

  if (limitedRows.length === 0) {
    return [];
  }

  const workIds = Array.from(new Set(limitedRows.map((row) => row.work_id)));
  const partyIds = Array.from(new Set(limitedRows.map((row) => row.party_id)));

  const [{ data: works, error: worksError }, { data: parties, error: partiesError }] =
    await Promise.all([
      supabaseAdmin.from("works").select("id, title").in("id", workIds),
      supabaseAdmin.from("parties").select("id, name").in("id", partyIds),
    ]);

  if (worksError) {
    throw new Error(`listAllocationQARows works failed: ${worksError.message}`);
  }

  if (partiesError) {
    throw new Error(`listAllocationQARows parties failed: ${partiesError.message}`);
  }

  const workMap = new Map<string, string>();
  for (const work of works ?? []) {
    workMap.set(String(work.id), typeof work.title === "string" ? work.title : "Untitled work");
  }

  const partyMap = new Map<string, string>();
  for (const party of parties ?? []) {
    partyMap.set(
      String(party.id),
      typeof party.name === "string" && party.name.trim() !== ""
        ? party.name
        : "Unnamed party"
    );
  }

  return limitedRows.map((row) => ({
    allocationRowId: row.id,
    importRowId: row.import_row_id,
    workId: row.work_id,
    workTitle: workMap.get(row.work_id) ?? "Untitled work",
    partyId: row.party_id,
    partyName: partyMap.get(row.party_id) ?? "Unnamed party",
    sourceAmount: round6(toNumber(row.row_amount)),
    sharePercent: round6(toNumber(row.share_bps) / 100),
    allocatedAmount: round6(toNumber(row.allocated_amount)),
    currency: row.currency,
  }));
}

type AllocationRunBlockerRaw = {
  id: string;
  import_row_id: string | null;
  blocker_code: string | null;
  severity: "info" | "warning" | "error" | null;
  message: string | null;
};

type ImportRowLookup = {
  id: string;
  row_number: number | null;
  status: string | null;
  raw_title: string | null;
};

export async function listAllocationQABlockers(params: {
  allocationRunId: string;
}): Promise<AllocationQABlockerRow[]> {
  const { data: blockers, error: blockersError } = await supabaseAdmin
    .from("allocation_run_blockers")
    .select("id, import_row_id, blocker_code, severity, message")
    .eq("allocation_run_id", params.allocationRunId);

  if (blockersError) {
    throw new Error(`listAllocationQABlockers failed: ${blockersError.message}`);
  }

  const typedBlockers = (blockers ?? []) as AllocationRunBlockerRaw[];
  if (typedBlockers.length === 0) {
    return [];
  }

  const importRowIds = Array.from(
    new Set(
      typedBlockers
        .map((blocker) => blocker.import_row_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const importRowMap = new Map<string, ImportRowLookup>();

  if (importRowIds.length > 0) {
    const { data: importRows, error: importRowsError } = await supabaseAdmin
      .from("import_rows")
      .select("id, row_number, status, raw_title")
      .in("id", importRowIds);

    if (importRowsError) {
      throw new Error(`listAllocationQABlockers import rows failed: ${importRowsError.message}`);
    }

    for (const row of (importRows ?? []) as ImportRowLookup[]) {
      importRowMap.set(String(row.id), row);
    }
  }

  return typedBlockers.map((blocker) => {
    const row = blocker.import_row_id
      ? importRowMap.get(blocker.import_row_id) ?? null
      : null;

    return {
      blockerId: blocker.id,
      importRowId: blocker.import_row_id,
      rowNumber: row?.row_number ?? null,
      rowStatus: row?.status ?? null,
      rawTitle: row?.raw_title ?? null,
      blockerCode: blocker.blocker_code ?? "UNKNOWN_BLOCKER",
      severity: blocker.severity ?? "error",
      message: blocker.message ?? "Unknown blocker",
    };
  });
}