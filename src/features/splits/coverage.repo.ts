import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { listAllocationBlockersForImport } from "@/features/allocations/allocations.repo";

export type WorkSplitCoverageRow = {
  workId: string;
  workTitle: string;
  workIsrc: string | null;
  splitCount: number;
  splitTotal: number;
  status: "missing" | "invalid" | "valid";
  blockedRows: number;
};

type WorkSplitStatusViewRow = {
  work_id: string;
  company_id: string;
  work_title: string;
  isrc: string | null;
  split_count: number | string | null;
  split_total: number | string | null;
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

export async function listWorkSplitCoverage(params: {
  companyId: string;
  importId?: string | null;
}): Promise<WorkSplitCoverageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("work_split_status_v")
    .select("*")
    .eq("company_id", params.companyId)
    .order("work_title", { ascending: true });

  if (error) {
    throw new Error(`listWorkSplitCoverage failed: ${error.message}`);
  }

  const blockers = params.importId
    ? await listAllocationBlockersForImport({
        companyId: params.companyId,
        importId: params.importId,
      })
    : [];

  const blockedRowsByWork = new Map<string, number>();
  for (const blocker of blockers) {
    blockedRowsByWork.set(blocker.workId, blocker.blockedRows);
  }

  return ((data ?? []) as WorkSplitStatusViewRow[]).map((row) => {
    const splitCount = toNumber(row.split_count);
    const splitTotal = round6(toNumber(row.split_total));

    let status: "missing" | "invalid" | "valid" = "valid";
    if (splitCount === 0) status = "missing";
    else if (splitTotal !== 100) status = "invalid";

    return {
      workId: row.work_id,
      workTitle: row.work_title ?? "Untitled work",
      workIsrc: row.isrc ?? null,
      splitCount,
      splitTotal,
      status,
      blockedRows: blockedRowsByWork.get(row.work_id) ?? 0,
    };
  });
}

export async function getWorkSplitCoverageSummary(params: {
  companyId: string;
  importId?: string | null;
}) {
  const rows = await listWorkSplitCoverage(params);

  const missing = rows.filter((r) => r.status === "missing").length;
  const invalid = rows.filter((r) => r.status === "invalid").length;
  const valid = rows.filter((r) => r.status === "valid").length;
  const blockedRows = rows.reduce((sum, row) => sum + row.blockedRows, 0);

  return {
    totalWorks: rows.length,
    missing,
    invalid,
    valid,
    blockedRows,
  };
}