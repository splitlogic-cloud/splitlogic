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

type AllocationRowRaw = {
  id: string;
  import_row_id: string;
  work_id: string;
  party_id: string;
  source_amount: string | number | null;
  share_percent: string | number | null;
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
      .from("allocation_rows")
      .select(
        "id, import_row_id, work_id, party_id, source_amount, share_percent, allocated_amount, currency"
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
  limit?: number;
}): Promise<AllocationQARow[]> {
  const rows = await loadAllocationRows(params.allocationRunId);
  const limitedRows = rows.slice(0, params.limit ?? 500);

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
    sourceAmount: round6(toNumber(row.source_amount)),
    sharePercent: round6(toNumber(row.share_percent)),
    allocatedAmount: round6(toNumber(row.allocated_amount)),
    currency: row.currency,
  }));
}