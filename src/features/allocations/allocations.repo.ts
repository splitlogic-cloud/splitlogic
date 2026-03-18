import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AllocationRunStatus = "running" | "completed" | "failed";

export type AllocationRunRow = {
  id: string;
  company_id: string;
  import_id: string;
  status: AllocationRunStatus;
  total_input_rows: number;
  eligible_rows: number;
  allocated_rows: number;
  skipped_unmatched_rows: number;
  skipped_missing_splits_rows: number;
  skipped_invalid_split_rows: number;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
};

export type AllocationRowInsert = {
  allocation_run_id: string;
  company_id: string;
  import_id: string;
  import_row_id: string;
  work_id: string;
  party_id: string;
  split_id: string;
  source_amount: string;
  share_percent: string;
  allocated_amount: string;
  currency: string | null;
};

type ImportRowRecord = {
  id: string;
  import_id: string;
  matched_work_id: string | null;
  raw: Record<string, unknown> | null;
  created_at?: string | null;
};

type SplitRecord = {
  id: string;
  company_id: string;
  work_id: string;
  party_id: string;
  share_percent: number | string;
  created_at?: string | null;
};

export type AllocationRunSummary = {
  runId: string;
  totalInputRows: number;
  eligibleRows: number;
  allocatedRows: number;
  skippedUnmatchedRows: number;
  skippedMissingSplitsRows: number;
  skippedInvalidSplitRows: number;
};

export type AllocationPartyTotal = {
  partyId: string;
  partyName: string;
  allocatedAmount: number;
};

const READ_BATCH_SIZE = 1000;
const INSERT_BATCH_SIZE = 1000;
const IN_CHUNK_SIZE = 500;
const DEBUG_SAMPLE_LIMIT = 25;

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(/\s+/g, "").replace(",", ".");
    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toNumber(value: unknown): number {
  return parseOptionalNumber(value) ?? 0;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function extractRowAmount(raw: Record<string, unknown> | null): number {
  if (!raw) return 0;

  const candidates: unknown[] = [
    raw.net_share_account_currency,
    raw.netShareAccountCurrency,

    raw.gross_revenue_account_currency,
    raw.grossRevenueAccountCurrency,

    raw.netAccountAmount,
    raw.net_account_amount,
    raw.netRevenue,
    raw.net_revenue,
    raw.net_amount,

    raw.accountAmount,
    raw.account_amount,

    raw.royaltyAmount,
    raw.royalty_amount,

    raw.earnings,
    raw.income,
    raw.revenue,
    raw.amount,

    raw.grossSaleAmount,
    raw.gross_sale_amount,

    raw.payable_amount,
    raw.amount_payable,
  ];

  for (const candidate of candidates) {
    const parsed = parseOptionalNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return 0;
}

function extractRowCurrency(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;

  const candidates: unknown[] = [
    raw.account_currency,
    raw.accountCurrency,
    raw.currency,
    raw.sale_currency,
    raw.saleCurrency,
    raw.reporting_currency,
    raw.reportingCurrency,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  return null;
}

function pickDebugTitle(raw: Record<string, unknown> | null): string {
  if (!raw) return "";

  const candidates: unknown[] = [
    raw.title,
    raw.track,
    raw.track_title,
    raw.trackTitle,
    raw.song_title,
    raw.songTitle,
    raw.product,
    raw.release_title,
    raw.releaseTitle,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  return "";
}

function pickDebugArtist(raw: Record<string, unknown> | null): string {
  if (!raw) return "";

  const candidates: unknown[] = [
    raw.artist,
    raw.track_artist,
    raw.trackArtist,
    raw.product_artist,
    raw.productArtist,
    raw.main_artist,
    raw.mainArtist,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  return "";
}

function pickDebugIsrc(raw: Record<string, unknown> | null): string {
  if (!raw) return "";

  const candidates: unknown[] = [raw.isrc, raw.ISRC];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  return "";
}

function hasValid100PercentSplit(splits: SplitRecord[]): boolean {
  if (splits.length === 0) return false;

  const total = round6(
    splits.reduce((sum, split) => sum + toNumber(split.share_percent), 0)
  );

  return total === 100;
}

function buildSplitDebugShape(splits: SplitRecord[]) {
  return splits.map((split) => ({
    splitId: split.id,
    partyId: split.party_id,
    sharePercent: toNumber(split.share_percent),
  }));
}

async function createAllocationRun(params: {
  companyId: string;
  importId: string;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .insert({
      company_id: params.companyId,
      import_id: params.importId,
      status: "running",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`create allocation run failed: ${error.message}`);
  }

  return data.id;
}

async function completeAllocationRun(
  runId: string,
  summary: Omit<AllocationRunSummary, "runId">
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "completed",
      total_input_rows: summary.totalInputRows,
      eligible_rows: summary.eligibleRows,
      allocated_rows: summary.allocatedRows,
      skipped_unmatched_rows: summary.skippedUnmatchedRows,
      skipped_missing_splits_rows: summary.skippedMissingSplitsRows,
      skipped_invalid_split_rows: summary.skippedInvalidSplitRows,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    throw new Error(`complete allocation run failed: ${error.message}`);
  }
}

async function failAllocationRun(runId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    throw new Error(`fail allocation run failed: ${error.message}`);
  }
}

async function loadImportRows(params: {
  importId: string;
}): Promise<ImportRowRecord[]> {
  const allRows: ImportRowRecord[] = [];
  let from = 0;

  while (true) {
    const to = from + READ_BATCH_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("import_rows")
      .select("id, import_id, matched_work_id, raw, created_at")
      .eq("import_id", params.importId)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`load import rows failed: ${error.message}`);
    }

    const batch = (data ?? []) as ImportRowRecord[];
    allRows.push(...batch);

    if (batch.length < READ_BATCH_SIZE) {
      break;
    }

    from += READ_BATCH_SIZE;
  }

  return allRows;
}

async function loadSplitsForWorks(params: {
  companyId: string;
  workIds: string[];
}): Promise<Map<string, SplitRecord[]>> {
  const map = new Map<string, SplitRecord[]>();

  if (params.workIds.length === 0) {
    return map;
  }

  const workIdChunks = chunkArray(params.workIds, IN_CHUNK_SIZE);

  for (const workIdChunk of workIdChunks) {
    let from = 0;

    while (true) {
      const to = from + READ_BATCH_SIZE - 1;

      const { data, error } = await supabaseAdmin
        .from("splits")
        .select("id, company_id, work_id, party_id, share_percent, created_at")
        .eq("company_id", params.companyId)
        .in("work_id", workIdChunk)
        .order("created_at", { ascending: true })
        .range(from, to);

      if (error) {
        throw new Error(`load splits failed: ${error.message}`);
      }

      const batch = (data ?? []) as SplitRecord[];

      for (const row of batch) {
        const current = map.get(row.work_id) ?? [];
        current.push(row);
        map.set(row.work_id, current);
      }

      if (batch.length < READ_BATCH_SIZE) {
        break;
      }

      from += READ_BATCH_SIZE;
    }
  }

  return map;
}

async function insertAllocationRows(rows: AllocationRowInsert[]): Promise<void> {
  if (rows.length === 0) return;

  const chunks = chunkArray(rows, INSERT_BATCH_SIZE);

  for (const chunk of chunks) {
    const { error } = await supabaseAdmin.from("allocation_rows").insert(chunk);

    if (error) {
      throw new Error(`insert allocation rows failed: ${error.message}`);
    }
  }
}

export async function runAllocationEngineV1(params: {
  companyId: string;
  importId: string;
}): Promise<AllocationRunSummary> {
  const runId = await createAllocationRun({
    companyId: params.companyId,
    importId: params.importId,
  });

  try {
    const importRows = await loadImportRows({
      importId: params.importId,
    });

    console.log("[allocation] run started", {
      runId,
      companyId: params.companyId,
      importId: params.importId,
      importRowsLoaded: importRows.length,
    });

    const totalInputRows = importRows.length;

    const unmatchedRows = importRows.filter((row) => !row.matched_work_id);
    const matchedRows = importRows.filter((row) => !!row.matched_work_id);

    const workIds = Array.from(
      new Set(
        matchedRows
          .map((row) => row.matched_work_id)
          .filter((value): value is string => !!value)
      )
    );

    const splitsByWorkId = await loadSplitsForWorks({
      companyId: params.companyId,
      workIds,
    });

    console.log("[allocation] split coverage loaded", {
      distinctMatchedWorks: workIds.length,
      worksWithAnySplits: splitsByWorkId.size,
    });

    const allocationRowsToInsert: AllocationRowInsert[] = [];

    let eligibleRows = 0;
    let skippedMissingSplitsRows = 0;
    let skippedInvalidSplitRows = 0;

    const missingSplitWorkCounts = new Map<string, number>();
    const invalidSplitWorkCounts = new Map<string, number>();

    const missingSplitSamples: Array<{
      importRowId: string;
      workId: string;
      title: string;
      artist: string;
      isrc: string;
      amount: number;
      currency: string | null;
    }> = [];

    const invalidSplitSamples: Array<{
      importRowId: string;
      workId: string;
      title: string;
      artist: string;
      isrc: string;
      amount: number;
      currency: string | null;
      splitTotal: number;
      splits: Array<{
        splitId: string;
        partyId: string;
        sharePercent: number;
      }>;
    }> = [];

    for (const row of matchedRows) {
      const workId = row.matched_work_id;
      if (!workId) continue;

      const splits = splitsByWorkId.get(workId) ?? [];
      const sourceAmount = extractRowAmount(row.raw);
      const currency = extractRowCurrency(row.raw);
      const title = pickDebugTitle(row.raw);
      const artist = pickDebugArtist(row.raw);
      const isrc = pickDebugIsrc(row.raw);

      if (splits.length === 0) {
        skippedMissingSplitsRows += 1;
        missingSplitWorkCounts.set(
          workId,
          (missingSplitWorkCounts.get(workId) ?? 0) + 1
        );

        if (missingSplitSamples.length < DEBUG_SAMPLE_LIMIT) {
          missingSplitSamples.push({
            importRowId: row.id,
            workId,
            title,
            artist,
            isrc,
            amount: sourceAmount,
            currency,
          });
        }

        continue;
      }

      const splitTotal = round6(
        splits.reduce((sum, split) => sum + toNumber(split.share_percent), 0)
      );

      if (!hasValid100PercentSplit(splits)) {
        skippedInvalidSplitRows += 1;
        invalidSplitWorkCounts.set(
          workId,
          (invalidSplitWorkCounts.get(workId) ?? 0) + 1
        );

        if (invalidSplitSamples.length < DEBUG_SAMPLE_LIMIT) {
          invalidSplitSamples.push({
            importRowId: row.id,
            workId,
            title,
            artist,
            isrc,
            amount: sourceAmount,
            currency,
            splitTotal,
            splits: buildSplitDebugShape(splits),
          });
        }

        continue;
      }

      eligibleRows += 1;

      for (const split of splits) {
        const sharePercent = toNumber(split.share_percent);
        const allocatedAmount = round6((sourceAmount * sharePercent) / 100);

        allocationRowsToInsert.push({
          allocation_run_id: runId,
          company_id: params.companyId,
          import_id: params.importId,
          import_row_id: row.id,
          work_id: workId,
          party_id: split.party_id,
          split_id: split.id,
          source_amount: sourceAmount.toFixed(6),
          share_percent: sharePercent.toFixed(6),
          allocated_amount: allocatedAmount.toFixed(6),
          currency,
        });
      }
    }

    await insertAllocationRows(allocationRowsToInsert);

    const summary: AllocationRunSummary = {
      runId,
      totalInputRows,
      eligibleRows,
      allocatedRows: allocationRowsToInsert.length,
      skippedUnmatchedRows: unmatchedRows.length,
      skippedMissingSplitsRows,
      skippedInvalidSplitRows,
    };

    const topMissingWorks = Array.from(missingSplitWorkCounts.entries())
      .map(([workId, count]) => ({ workId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const topInvalidWorks = Array.from(invalidSplitWorkCounts.entries())
      .map(([workId, count]) => ({ workId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    console.log("[allocation] run summary", summary);

    if (missingSplitSamples.length > 0) {
      console.log("[allocation] sample rows with NO splits", missingSplitSamples);
    }

    if (invalidSplitSamples.length > 0) {
      console.log(
        "[allocation] sample rows with INVALID splits",
        invalidSplitSamples
      );
    }

    if (topMissingWorks.length > 0) {
      console.log("[allocation] top works missing splits", topMissingWorks);
    }

    if (topInvalidWorks.length > 0) {
      console.log("[allocation] top works with invalid splits", topInvalidWorks);
    }

    await completeAllocationRun(runId, {
      totalInputRows: summary.totalInputRows,
      eligibleRows: summary.eligibleRows,
      allocatedRows: summary.allocatedRows,
      skippedUnmatchedRows: summary.skippedUnmatchedRows,
      skippedMissingSplitsRows: summary.skippedMissingSplitsRows,
      skippedInvalidSplitRows: summary.skippedInvalidSplitRows,
    });

    return summary;
  } catch (error) {
    try {
      await failAllocationRun(runId);
    } catch {
      // preserve original error
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("run allocation engine failed");
  }
}

export async function getLatestAllocationRunForImport(params: {
  companyId: string;
  importId: string;
}): Promise<AllocationRunRow | null> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select("*")
    .eq("company_id", params.companyId)
    .eq("import_id", params.importId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`load latest allocation run failed: ${error.message}`);
  }

  return (data as AllocationRunRow | null) ?? null;
}

export async function listAllocationTotalsByParty(params: {
  allocationRunId: string;
}): Promise<AllocationPartyTotal[]> {
  const allRows: Array<{ party_id: string; allocated_amount: string | number }> =
    [];
  let from = 0;

  while (true) {
    const to = from + READ_BATCH_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("allocation_rows")
      .select("party_id, allocated_amount")
      .eq("allocation_run_id", params.allocationRunId)
      .range(from, to);

    if (error) {
      throw new Error(`list allocation totals by party failed: ${error.message}`);
    }

    const batch = (data ?? []) as Array<{
      party_id: string;
      allocated_amount: string | number;
    }>;

    allRows.push(...batch);

    if (batch.length < READ_BATCH_SIZE) {
      break;
    }

    from += READ_BATCH_SIZE;
  }

  const totals = new Map<string, number>();

  for (const row of allRows) {
    const partyId = String(row.party_id);
    const allocatedAmount = toNumber(row.allocated_amount);
    totals.set(
      partyId,
      round6((totals.get(partyId) ?? 0) + allocatedAmount)
    );
  }

  const partyIds = Array.from(totals.keys());

  if (partyIds.length === 0) {
    return [];
  }

  const partyChunks = chunkArray(partyIds, IN_CHUNK_SIZE);
  const partyNameMap = new Map<string, string>();

  for (const partyChunk of partyChunks) {
    const { data: parties, error: partiesError } = await supabaseAdmin
      .from("parties")
      .select("id, name")
      .in("id", partyChunk);

    if (partiesError) {
      throw new Error(`load parties failed: ${partiesError.message}`);
    }

    for (const party of parties ?? []) {
      partyNameMap.set(
        String(party.id),
        typeof party.name === "string" && party.name.trim() !== ""
          ? party.name
          : "Unnamed party"
      );
    }
  }

  return partyIds
    .map((partyId) => ({
      partyId,
      partyName: partyNameMap.get(partyId) ?? "Unnamed party",
      allocatedAmount: round6(totals.get(partyId) ?? 0),
    }))
    .sort((a, b) => b.allocatedAmount - a.allocatedAmount);
}