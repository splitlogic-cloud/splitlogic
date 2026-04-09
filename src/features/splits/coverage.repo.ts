import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { listAllocationBlockersForImport } from "@/features/allocations/allocations.repo";

export type WorkSplitCoverageRow = {
  work_id: string;
  work_title: string | null;
  split_count: number;
  total_share_bps: number;
  is_complete: boolean;
};

export type CoverageBlockerRow = {
  id?: string;
  status?: string | null;
  row_number?: number | null;
  raw_title?: string | null;
};

export type SplitCoverageSummary = {
  rows: WorkSplitCoverageRow[];
  blockers: CoverageBlockerRow[];

  totalWorks: number;
  worksWithAnySplits: number;
  worksFullyCovered: number;
  worksMissingSplits: number;

  completeWorks: number;
  incompleteWorks: number;

  blockerCount: number;
  blockersCount: number;
};

type WorkSplitJoinRow = {
  work_id: string | null;
  share_bps: number | null;
  works:
    | {
        id: string;
        title: string | null;
        company_id?: string | null;
      }
    | Array<{
        id: string;
        title: string | null;
        company_id?: string | null;
      }>
    | null;
};

type WorkLegacySplitJoinRow = {
  work_id: string | null;
  share_percent: number | null;
  works:
    | {
        id: string;
        title: string | null;
        company_id?: string | null;
      }
    | Array<{
        id: string;
        title: string | null;
        company_id?: string | null;
      }>
    | null;
};

function normalizeJoinedWork(
  works: WorkSplitJoinRow["works"]
): { id: string; title: string | null } | null {
  if (!works) return null;

  if (Array.isArray(works)) {
    const first = works[0];
    if (!first?.id) return null;

    return {
      id: first.id,
      title: first.title ?? null,
    };
  }

  if (!works.id) return null;

  return {
    id: works.id,
    title: works.title ?? null,
  };
}

async function loadCoverageRows(companyId: string): Promise<WorkSplitCoverageRow[]> {
  let data: WorkSplitJoinRow[] | WorkLegacySplitJoinRow[] = [];
  let errorMessage: string | null = null;

  const preferred = await supabaseAdmin
    .from("work_splits")
    .select(
      `
      work_id,
      share_bps,
      works!inner (
        id,
        title,
        company_id
      )
      `
    )
    .eq("company_id", companyId);

  if (!preferred.error) {
    data = (preferred.data ?? []) as WorkSplitJoinRow[];
  } else {
    errorMessage = preferred.error.message;

    const legacy = await supabaseAdmin
      .from("splits")
      .select(
        `
        work_id,
        share_percent,
        works!inner (
          id,
          title,
          company_id
        )
        `
      )
      .eq("company_id", companyId);

    if (legacy.error) {
      throw new Error(
        `loadCoverageRows failed: ${legacy.error.message} (fallback after: ${errorMessage})`
      );
    }

    data = (legacy.data ?? []) as WorkLegacySplitJoinRow[];
  }

  const grouped = new Map<string, WorkSplitCoverageRow>();

  for (const rawRow of data) {
    const row = rawRow as WorkSplitJoinRow & WorkLegacySplitJoinRow;
    const work = normalizeJoinedWork(row.works);
    const workId = work?.id ?? row.work_id ?? null;

    if (!workId) continue;

    const shareBps =
      row.share_bps != null
        ? Number(row.share_bps)
        : Math.round(Number(row.share_percent ?? 0) * 100);

    const current = grouped.get(workId) ?? {
      work_id: workId,
      work_title: work?.title ?? null,
      split_count: 0,
      total_share_bps: 0,
      is_complete: false,
    };

    current.split_count += 1;
    current.total_share_bps += shareBps;
    current.is_complete = current.total_share_bps === 10000;

    grouped.set(workId, current);
  }

  return Array.from(grouped.values()).sort((a, b) =>
    (a.work_title ?? "").localeCompare(b.work_title ?? "")
  );
}

export async function getSplitCoverageSummary(params: {
  companyId: string;
  importJobId?: string | null;
  allocationRunId?: string | null;
}): Promise<SplitCoverageSummary> {
  const rows = await loadCoverageRows(params.companyId);

  const blockers = params.importJobId
    ? ((await listAllocationBlockersForImport(
        params.importJobId
      )) as CoverageBlockerRow[])
    : [];

  const totalWorks = rows.length;
  const worksWithAnySplits = rows.filter((row) => row.split_count > 0).length;
  const worksFullyCovered = rows.filter((row) => row.is_complete).length;
  const worksMissingSplits = totalWorks - worksWithAnySplits;
  const completeWorks = worksFullyCovered;
  const incompleteWorks = totalWorks - completeWorks;
  const blockerCount = blockers.length;
  const blockersCount = blockers.length;

  return {
    rows,
    blockers,
    totalWorks,
    worksWithAnySplits,
    worksFullyCovered,
    worksMissingSplits,
    completeWorks,
    incompleteWorks,
    blockerCount,
    blockersCount,
  };
}

export async function getWorkSplitCoverageSummary(params: {
  companyId: string;
  importJobId?: string | null;
  allocationRunId?: string | null;
}): Promise<SplitCoverageSummary> {
  return getSplitCoverageSummary(params);
}

export async function listWorkSplitCoverage(params: {
  companyId: string;
  importJobId?: string | null;
  allocationRunId?: string | null;
}): Promise<WorkSplitCoverageRow[]> {
  const summary = await getSplitCoverageSummary(params);
  return summary.rows;
}