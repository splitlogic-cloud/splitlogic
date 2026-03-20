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

export type WorkSplitCoverageBlocker = {
  id: string;
  blocker_code: string;
  severity: string;
  message: string;
  import_row_id: string | null;
  created_at: string;
};

export type WorkSplitCoverageSummary = {
  totalWorks: number;
  worksWithAnySplits: number;
  worksFullyCovered: number;
  worksMissingSplits: number;
  blockersCount: number;
};

type InternalCoverageResult = {
  summary: WorkSplitCoverageSummary;
  rows: WorkSplitCoverageRow[];
  blockers: WorkSplitCoverageBlocker[];
};

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function loadCoverageData(params: {
  companyId: string;
  importJobId?: string | null;
  allocationRunId?: string | null;
}): Promise<InternalCoverageResult> {
  const { data: works, error: worksError } = await supabaseAdmin
    .from("works")
    .select("id, title")
    .eq("company_id", params.companyId)
    .order("title", { ascending: true });

  if (worksError) {
    throw new Error(`Failed to load works: ${worksError.message}`);
  }

  const workIds = (works ?? []).map((work) => String(work.id));

  let splitRows:
    | Array<{
        work_id: string;
        share_bps: number | null;
      }>
    | null = [];

  if (workIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("work_splits")
      .select("work_id, share_bps")
      .eq("company_id", params.companyId)
      .in("work_id", workIds);

    if (error) {
      throw new Error(`Failed to load work splits: ${error.message}`);
    }

    splitRows = data;
  }

  const splitStats = new Map<
    string,
    {
      split_count: number;
      total_share_bps: number;
    }
  >();

  for (const split of splitRows ?? []) {
    const workId = String(split.work_id);
    const current = splitStats.get(workId) ?? {
      split_count: 0,
      total_share_bps: 0,
    };

    current.split_count += 1;
    current.total_share_bps += asNumber(split.share_bps);

    splitStats.set(workId, current);
  }

  const rows: WorkSplitCoverageRow[] = (works ?? []).map((work) => {
    const workId = String(work.id);
    const stat = splitStats.get(workId) ?? {
      split_count: 0,
      total_share_bps: 0,
    };

    return {
      work_id: workId,
      work_title: asString(work.title),
      split_count: stat.split_count,
      total_share_bps: stat.total_share_bps,
      is_complete: stat.split_count > 0 && stat.total_share_bps === 10000,
    };
  });

  const worksWithAnySplits = rows.filter((row) => row.split_count > 0).length;
  const worksFullyCovered = rows.filter((row) => row.is_complete).length;
  const worksMissingSplits = rows.filter((row) => row.split_count === 0).length;

  const rawBlockers = params.importJobId
    ? await listAllocationBlockersForImport(
        params.companyId,
        params.importJobId,
        params.allocationRunId ?? null
      )
    : [];

  const blockers: WorkSplitCoverageBlocker[] = rawBlockers.map((blocker) => ({
    id: blocker.id,
    blocker_code: blocker.blocker_code,
    severity: blocker.severity,
    message: blocker.message,
    import_row_id: blocker.import_row_id,
    created_at: blocker.created_at,
  }));

  return {
    summary: {
      totalWorks: rows.length,
      worksWithAnySplits,
      worksFullyCovered,
      worksMissingSplits,
      blockersCount: blockers.length,
    },
    rows,
    blockers,
  };
}

export async function getWorkSplitCoverageSummary(params: {
  companyId: string;
  importJobId?: string | null;
  allocationRunId?: string | null;
}): Promise<WorkSplitCoverageSummary> {
  const result = await loadCoverageData(params);
  return result.summary;
}

export async function listWorkSplitCoverage(params: {
  companyId: string;
  importJobId?: string | null;
  allocationRunId?: string | null;
}): Promise<WorkSplitCoverageRow[]> {
  const result = await loadCoverageData(params);
  return result.rows;
}

export async function listWorkSplitCoverageBlockers(params: {
  companyId: string;
  importJobId?: string | null;
  allocationRunId?: string | null;
}): Promise<WorkSplitCoverageBlocker[]> {
  const result = await loadCoverageData(params);
  return result.blockers;
}