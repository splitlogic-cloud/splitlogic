import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import RunImportParseButton from "./RunImportParseButton";
import RunMatchingButton from "./RunMatchingButton";
import RunAllocationButton from "./RunAllocationButton";
import MatchReviewTable from "./MatchReviewTable";
import AllocationRunSummary from "./AllocationRunSummary";
import { runMatchingAction } from "./actions";
import {
  getLatestAllocationRunForImport,
  importRowsForJobOrFilter,
} from "@/features/allocations/allocations.repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = {
  params: Promise<{ companySlug: string; importJobId: string }>;
};

type CompanyRecord = {
  id: string;
  slug: string;
  name: string | null;
};

type ImportJobRecord = {
  id: string;
  company_id: string;
  file_name: string | null;
  status: string | null;
  row_count?: number | null;
  parsed_row_count?: number | null;
  invalid_row_count?: number | null;
  matched_row_count?: number | null;
  review_row_count?: number | null;
};

type ImportRowStatusRecord = {
  status: string | null;
  allocation_status: string | null;
  matched_work_id: string | null;
};

type ImportRowSummary = {
  totalRows: number;
  parsedCount: number;
  matchedCount: number;
  allocatedCount: number;
  invalidCount: number;
  needsReviewCount: number;
  unmatchedCount: number;
  matchedWorkCount: number;
};

function isAllocatedAllocationStatus(value: string | null | undefined) {
  return value === "allocated" || value === "completed";
}

async function listAllImportRowStatuses(
  companyId: string,
  importJobId: string,
): Promise<ImportRowStatusRecord[]> {
  const pageSize = 1000;
  const rows: ImportRowStatusRecord[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabaseAdmin
      .from("import_rows")
      .select("status, allocation_status, matched_work_id")
      .eq("company_id", companyId)
      .or(importRowsForJobOrFilter(importJobId))
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load import row statuses: ${error.message}`);
    }

    const batch = (data ?? []) as ImportRowStatusRecord[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

function summarizeImportRows(rows: ImportRowStatusRecord[]): ImportRowSummary {
  let totalRows = 0;
  let parsedCount = 0;
  let matchedCount = 0;
  let allocatedCount = 0;
  let invalidCount = 0;
  let needsReviewCount = 0;
  let unmatchedCount = 0;
  let matchedWorkCount = 0;

  for (const row of rows) {
    totalRows += 1;

    const status = row.status ?? null;
    const allocationStatus = row.allocation_status ?? null;
    const hasMatchedWork = row.matched_work_id != null;
    const isAllocated = isAllocatedAllocationStatus(allocationStatus);

    if (hasMatchedWork) {
      matchedWorkCount += 1;
    }

    if (status === "invalid") {
      invalidCount += 1;
      continue;
    }

    if (status === "needs_review") {
      needsReviewCount += 1;
      continue;
    }

    if (status === "unmatched") {
      unmatchedCount += 1;
      continue;
    }

    if (isAllocated) {
      allocatedCount += 1;
      continue;
    }

    if (status === "matched" || hasMatchedWork) {
      matchedCount += 1;
      continue;
    }

    if (status === "parsed") {
      parsedCount += 1;
      continue;
    }
  }

  return {
    totalRows,
    parsedCount,
    matchedCount,
    allocatedCount,
    invalidCount,
    needsReviewCount,
    unmatchedCount,
    matchedWorkCount,
  };
}

function getImportJobStatusLabel(status: string | null | undefined) {
  return status || "-";
}

export default async function ImportDetailPage({ params }: Params) {
  const { companySlug, importJobId } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const typedCompany = company as CompanyRecord;

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("*")
    .eq("id", importJobId)
    .eq("company_id", typedCompany.id)
    .maybeSingle();

  if (importJobError) {
    throw new Error(`Failed to load import job: ${importJobError.message}`);
  }

  if (!importJob) {
    notFound();
  }

  const typedImportJob = importJob as ImportJobRecord;

  const importRows = await listAllImportRowStatuses(
    typedCompany.id,
    importJobId,
  );
  const summary = summarizeImportRows(importRows);

  const totalReviewCount =
    summary.invalidCount + summary.needsReviewCount + summary.unmatchedCount;

  const importJobStatus = String(typedImportJob.status ?? "");

  const isBusy =
    importJobStatus === "parsing" ||
    importJobStatus === "matching" ||
    importJobStatus === "allocating";

  const isCompleted = importJobStatus === "completed";
  const isFullyAllocated =
    summary.totalRows > 0 && summary.allocatedCount === summary.totalRows;

  const latestAllocationRun = await getLatestAllocationRunForImport({
    companyId: typedCompany.id,
    importJobId,
  });
  const latestRunSummaryEmpty =
    latestAllocationRun != null &&
    latestAllocationRun.status === "completed" &&
    (latestAllocationRun.input_row_count ?? 0) === 0 &&
    (latestAllocationRun.allocated_row_count ?? 0) === 0;

  const canRunParse = !isBusy;
  const canRunMatching = !isBusy && summary.totalRows > 0;
  const canRunAllocation =
    !isBusy && summary.matchedWorkCount > 0 && !isCompleted;
  const canRerunAllocation =
    !isBusy && summary.matchedWorkCount > 0 && isCompleted;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/c/${companySlug}/imports`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to imports
        </Link>

        <div>
          <h1 className="text-2xl font-semibold">Import job</h1>
          <p className="text-sm text-neutral-600">
            {typedImportJob.file_name ?? "Unnamed file"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          {
            label: "Job status",
            value: getImportJobStatusLabel(typedImportJob.status),
          },
          {
            label: "Parsed",
            value: summary.parsedCount,
          },
          {
            label: "Matched",
            value: summary.matchedCount,
          },
          {
            label: "Allocated",
            value: summary.allocatedCount,
          },
          {
            label: "Needs review",
            value: totalReviewCount,
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              {stat.label}
            </div>
            <div className="mt-2 text-lg font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-4 text-sm text-neutral-700">
        <div className="font-medium">Allocation readiness</div>

        <div className="mt-2 space-y-1">
          <p>Total rows: {summary.totalRows}</p>
          <p>Rows with matched work: {summary.matchedWorkCount}</p>
          <p>Rows needing review: {totalReviewCount}</p>
          <p>
            Current import job status: {getImportJobStatusLabel(importJobStatus)}
          </p>
        </div>

        {isCompleted && isFullyAllocated ? (
          <p className="mt-3 font-semibold text-emerald-700">
            ✅ Allocation completed successfully. All {summary.totalRows} rows
            allocated.
          </p>
        ) : isBusy ? (
          <p className="mt-3 text-amber-700">
            This import is currently processing. Wait until it finishes before
            running the next step.
          </p>
        ) : summary.matchedWorkCount === 0 ? (
          <p className="mt-3 text-amber-700">
            Allocation is disabled because there are no matched rows yet.
          </p>
        ) : totalReviewCount > 0 ? (
          <p className="mt-3 text-emerald-700">
            Allocation can run. Unmatched or review rows will remain blocked and
            will not stop allocation for already matched rows.
          </p>
        ) : (
          <p className="mt-3 text-emerald-700">
            All rows are matched and ready for allocation.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <RunImportParseButton
          companySlug={companySlug}
          importJobId={importJobId}
          disabled={!canRunParse || isCompleted}
        />

        <RunMatchingButton
          companySlug={companySlug}
          importJobId={importJobId}
          action={runMatchingAction}
          disabled={!canRunMatching || isCompleted}
        />

        <RunAllocationButton
          companySlug={companySlug}
          importJobId={importJobId}
          disabled={!canRunAllocation && !canRerunAllocation}
          label={
            canRerunAllocation ? "Re-run allocation" : undefined
          }
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Invalid rows
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.invalidCount}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Needs review
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.needsReviewCount}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Unmatched
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.unmatchedCount}
          </div>
        </div>
      </div>

      <MatchReviewTable
        companySlug={companySlug}
        importJobId={importJobId}
      />

      <AllocationRunSummary
        companyId={typedCompany.id}
        importJobId={importJobId}
      />
    </div>
  );
}