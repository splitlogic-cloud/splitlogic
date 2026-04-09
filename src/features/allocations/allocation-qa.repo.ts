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
  blockerCount: number;
};

export type AllocationQABlockerRow = {
  blockerId: string;
  importRowId: string | null;
  severity: "info" | "warning" | "error";
  blockerCode: string;
  message: string;
  rowNumber: number | null;
  rowStatus: string | null;
  rawTitle: string | null;
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

type AllocationRunBlockerRaw = {
  id: string;
  import_row_id: string | null;
  severity: "info" | "warning" | "error" | null;
  blocker_code: string | null;
  message: string | null;
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

async function loadAllocationRunBlockers(
  allocationRunId: string
): Promise<AllocationRunBlockerRaw[]> {
  const allRows: AllocationRunBlockerRaw[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const to = from + batchSize - 1;

    const { data, error } = await supabaseAdmin
      .from("allocation_run_blockers")
      .select("id, import_row_id, severity, blocker_code, message")
      .eq("allocation_run_id", allocationRunId)
      .range(from, to);

    if (error) {
      throw new Error(`loadAllocationRunBlockers failed: ${error.message}`);
    }

    const batch = (data ?? []) as AllocationRunBlockerRaw[];
    allRows.push(...batch);

    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return allRows;
}

export async function getAllocationQASummary(params: {
  allocationRunId: string;
}): Promise<AllocationQASummary> {
  const [rows, blockers] = await Promise.all([
    loadAllocationRows(params.allocationRunId),
    loadAllocationRunBlockers(params.allocationRunId),
  ]);

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
    blockerCount: blockers.length,
  };
}

export async function listAllocationQARows(params: {
  allocationRunId: string;
  limit?: number;
}): Promise<AllocationQARow[]> {
  const rows = await loadAllocationRows(params.allocationRunId);
  const limitedRows = rows.slice(0, params.limit ?? 500);

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

export async function listAllocationQABlockers(params: {
  allocationRunId: string;
  limit?: number;
}): Promise<AllocationQABlockerRow[]> {
  const blockers = await loadAllocationRunBlockers(params.allocationRunId);
  const limitedBlockers = blockers.slice(0, params.limit ?? 1000);

  if (limitedBlockers.length === 0) {
    return [];
  }

  const importRowIds = Array.from(
    new Set(
      limitedBlockers
        .map((blocker) => blocker.import_row_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const importRowsById = new Map<
    string,
    { row_number: number | null; status: string | null; raw_title: string | null }
  >();

  if (importRowIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("import_rows")
      .select("id, row_number, status, raw_title")
      .in("id", importRowIds);

    if (error) {
      throw new Error(`listAllocationQABlockers import rows failed: ${error.message}`);
    }

    for (const row of data ?? []) {
      importRowsById.set(String(row.id), {
        row_number:
          typeof row.row_number === "number" && Number.isFinite(row.row_number)
            ? row.row_number
            : null,
        status: typeof row.status === "string" ? row.status : null,
        raw_title: typeof row.raw_title === "string" ? row.raw_title : null,
      });
    }
  }

  return limitedBlockers.map((blocker) => {
    const importRow = blocker.import_row_id
      ? importRowsById.get(blocker.import_row_id) ?? null
      : null;

    return {
      blockerId: blocker.id,
      importRowId: blocker.import_row_id,
      severity: blocker.severity ?? "error",
      blockerCode: blocker.blocker_code ?? "UNKNOWN",
      message: blocker.message ?? "Unknown blocker",
      rowNumber: importRow?.row_number ?? null,
      rowStatus: importRow?.status ?? null,
      rawTitle: importRow?.raw_title ?? null,
    };
  });
}