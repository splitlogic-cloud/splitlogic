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

  const { data: statusRows, error: statusRowsError } = await supabaseAdmin
    .from("import_rows")
    .select("status, allocation_status, matched_work_id")
    .eq("import_job_id", importJobId);

  if (statusRowsError) {
    throw new Error(statusRowsError.message);
  }

  const rows = (statusRows ?? []) as ImportRowStatusRecord[];

  const totalRows = rows.length;

  let parsedCount = 0;
  let matchedCount = 0;
  let allocatedCount = 0;
  let invalidCount = 0;
  let needsReviewCount = 0;
  let unmatchedCount = 0;
  let matchedWorkCount = 0;

  for (const row of rows) {
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

  const reviewCount = invalidCount + needsReviewCount + unmatchedCount;
  const importJobStatus = String(importJob.status ?? "");

  const isBusy =
    importJobStatus === "parsing" ||
    importJobStatus === "matching" ||
    importJobStatus === "allocating";

  const canRunMatching = !isBusy && totalRows > 0;
  const canRunAllocation = !isBusy && matchedWorkCount > 0;

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
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Job status
          </div>
          <div className="mt-2 text-lg font-semibold">{importJob.status ?? "-"}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Parsed
          </div>
          <div className="mt-2 text-lg font-semibold">{parsedCount}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Matched
          </div>
          <div className="mt-2 text-lg font-semibold">{matchedCount}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Allocated
          </div>
          <div className="mt-2 text-lg font-semibold">{allocatedCount}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Needs review
          </div>
          <div className="mt-2 text-lg font-semibold">{reviewCount}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 text-sm text-neutral-700">
        <div className="font-medium">Allocation readiness</div>
        <div className="mt-2 space-y-1">
          <p>Total rows: {totalRows}</p>
          <p>Rows with matched work: {matchedWorkCount}</p>
          <p>Rows needing review: {reviewCount}</p>
          <p>Current import job status: {importJobStatus || "-"}</p>
        </div>
        {isBusy ? (
          <p className="mt-3 text-amber-700">
            This import is currently processing. Wait until the current job finishes before
            running the next step.
          </p>
        ) : matchedWorkCount === 0 ? (
          <p className="mt-3 text-amber-700">
            Allocation is disabled because there are no matched rows yet.
          </p>
        ) : (
          <p className="mt-3 text-emerald-700">
            Allocation can run. Unmatched or review rows will simply remain blocked and will
            not stop allocation for already matched rows.
          </p>
        )}
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