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
import { summarizeAllocationReadinessForImportJob } from "@/features/allocations/allocations.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = {
  params: Promise<{
    companySlug: string;
    importJobId: string;
  }>;
};

type ImportRowStatusRecord = {
  status: string | null;
  allocation_status: string | null;
  matched_work_id: string | null;
};

function isAllocatedAllocationStatus(value: string | null | undefined): boolean {
  return value === "allocated" || value === "completed";
}

async function listAllImportRowStatuses(
  importJobId: string
): Promise<ImportRowStatusRecord[]> {
  const pageSize = 1000;
  const rows: ImportRowStatusRecord[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabaseAdmin
      .from("import_rows")
      .select("status, allocation_status, matched_work_id")
      .eq("import_job_id", importJobId)
      .range(from, to);

    if (error) {
      throw new Error(error.message);
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

export default async function ImportDetailPage({ params }: Params) {
  const { companySlug, importJobId } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(companyError.message);
  }

  if (!company) {
    notFound();
  }

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("*")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (importJobError) {
    throw new Error(importJobError.message);
  }

  if (!importJob) {
    notFound();
  }

  const rows = await listAllImportRowStatuses(importJobId);
  const readiness = await summarizeAllocationReadinessForImportJob({
    companyId: company.id,
    importJobId,
  });

  let totalRows = 0;
  let parsedCount = 0;
  let matchedCount = 0;
  let allocatedCount = 0;
  let invalidCount = 0;
  let needsReviewCount = 0;
  let unmatchedCount = 0;
  let matchedWorkCount = 0;
  let strictMatchedCount = 0;

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

    if (status === "matched") {
      strictMatchedCount += 1;
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

  const reviewCount = invalidCount + needsReviewCount + unmatchedCount;

  const importJobStatus = String(importJob.status ?? "");

  const isBusy =
    importJobStatus === "parsing" ||
    importJobStatus === "matching" ||
    importJobStatus === "allocating";

  const canRunMatching = !isBusy && totalRows > 0;
  const canRunAllocation = !isBusy && strictMatchedCount > 0;

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
            {importJob.file_name ?? "Unnamed file"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Job status</div>
          <div className="mt-2 text-lg font-semibold">{importJob.status ?? "-"}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Parsed</div>
          <div className="mt-2 text-lg font-semibold">{parsedCount}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Matched</div>
          <div className="mt-2 text-lg font-semibold">{matchedCount}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Allocated</div>
          <div className="mt-2 text-lg font-semibold">{allocatedCount}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Needs review</div>
          <div className="mt-2 text-lg font-semibold">{reviewCount}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 text-sm text-neutral-700">
        <div className="font-medium">Allocation readiness</div>
        <div className="mt-2 space-y-1">
          <p>Total rows: {totalRows}</p>
          <p>Rows with matched work: {matchedWorkCount}</p>
          <p>Rows with status &quot;matched&quot;: {strictMatchedCount}</p>
          <p>Rows considered for allocation: {readiness.candidateRowCount}</p>
          <p>Rows ready for allocation: {readiness.rowsReadyForAllocation}</p>
          <p>Rows blocked by allocation rules: {readiness.blockedRowCount}</p>
          <p>Rows needing review: {reviewCount}</p>
          <p>Current import job status: {importJobStatus || "-"}</p>
        </div>

        {isBusy ? (
          <p className="mt-3 text-amber-700">
            This import is currently processing. Wait until the current job finishes before
            running the next step.
          </p>
        ) : strictMatchedCount === 0 ? (
          <p className="mt-3 text-amber-700">
            Allocation is disabled because there are no rows with status matched yet.
          </p>
        ) : readiness.rowsReadyForAllocation === 0 ? (
          <p className="mt-3 text-amber-700">
            Allocation is disabled because no matched rows currently pass allocation validation
            (for example missing currency or missing split configuration on the matched work).
          </p>
        ) : (
          <p className="mt-3 text-emerald-700">
            Allocation can run for {readiness.rowsReadyForAllocation} row
            {readiness.rowsReadyForAllocation === 1 ? "" : "s"}. Rows that still have blockers
            will remain unallocated.
          </p>
        )}

        {readiness.blockedRowCount > 0 ? (
          <div className="mt-3 text-xs text-neutral-600">
            <div className="font-medium">Top allocation blockers (row count)</div>
            <ul className="mt-1 list-disc pl-5">
              {readiness.blockerCounts.ROW_CURRENCY_MISSING > 0 ? (
                <li>Missing currency: {readiness.blockerCounts.ROW_CURRENCY_MISSING}</li>
              ) : null}
              {readiness.blockerCounts.NO_ACTIVE_SPLITS_FOR_WORK > 0 ? (
                <li>
                  No active split configuration on matched work:{" "}
                  {readiness.blockerCounts.NO_ACTIVE_SPLITS_FOR_WORK}
                </li>
              ) : null}
              {readiness.blockerCounts.SPLITS_NOT_100_PERCENT > 0 ? (
                <li>Split total is not 100%: {readiness.blockerCounts.SPLITS_NOT_100_PERCENT}</li>
              ) : null}
              {readiness.blockerCounts.DUPLICATE_SPLIT_CONFIGURATION > 0 ? (
                <li>
                  Duplicate split configuration:{" "}
                  {readiness.blockerCounts.DUPLICATE_SPLIT_CONFIGURATION}
                </li>
              ) : null}
              {readiness.blockerCounts.ROW_AMOUNT_MISSING > 0 ? (
                <li>Missing amount: {readiness.blockerCounts.ROW_AMOUNT_MISSING}</li>
              ) : null}
              {readiness.blockerCounts.ROW_NOT_MATCHED_TO_WORK > 0 ? (
                <li>Missing matched work: {readiness.blockerCounts.ROW_NOT_MATCHED_TO_WORK}</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <RunImportParseButton companySlug={companySlug} importJobId={importJobId} />
        <RunMatchingButton
          companySlug={companySlug}
          importJobId={importJobId}
          action={runMatchingAction}
          disabled={!canRunMatching}
        />
        <RunAllocationButton
          companySlug={companySlug}
          importJobId={importJobId}
          disabled={!canRunAllocation}
        />
      </div>

      <MatchReviewTable companySlug={companySlug} importJobId={importJobId} />

      <AllocationRunSummary importJobId={importJobId} />
    </div>
  );
}