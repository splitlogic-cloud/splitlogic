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
  params: Promise<{ companySlug: string; importJobId: string }>;
};

type ImportRowStatusRecord = {
  status: string | null;
  allocation_status: string | null;
  matched_work_id: string | null;
};

function isAllocatedAllocationStatus(value: string | null | undefined) {
  return value === "allocated" || value === "completed";
}

async function listAllImportRowStatuses(importJobId: string) {
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

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as ImportRowStatusRecord[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
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

  if (companyError) throw new Error(companyError.message);
  if (!company) notFound();

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("*")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (importJobError) throw new Error(importJobError.message);
  if (!importJob) notFound();

  const rows = await listAllImportRowStatuses(importJobId);

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

    if (hasMatchedWork) matchedWorkCount += 1;
    if (status === "invalid") invalidCount += 1;
    else if (status === "needs_review") needsReviewCount += 1;
    else if (status === "unmatched") unmatchedCount += 1;
    else if (isAllocated) allocatedCount += 1;
    else if (status === "matched" || hasMatchedWork) matchedCount += 1;
    else if (status === "parsed") parsedCount += 1;
  }

  const reviewCount = invalidCount + needsReviewCount + unmatchedCount;
  const importJobStatus = String(importJob.status ?? "");

  const isBusy =
    importJobStatus === "parsing" ||
    importJobStatus === "matching" ||
    importJobStatus === "allocating";

  const canRunMatching = !isBusy && totalRows > 0;
  const canRunAllocation = !isBusy && matchedWorkCount > 0;

  const isCompleted = importJobStatus === "completed";
  const isFullyAllocated = totalRows > 0 && allocatedCount === totalRows;

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-5">
        {[
          { label: "Job status", value: importJob.status ?? "-" },
          { label: "Parsed", value: parsedCount },
          { label: "Matched", value: matchedCount },
          { label: "Allocated", value: allocatedCount },
          { label: "Needs review", value: reviewCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              {stat.label}
            </div>
            <div className="mt-2 text-lg font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Allocation readiness */}
      <div className="rounded-lg border bg-white p-4 text-sm text-neutral-700">
        <div className="font-medium">Allocation readiness</div>
        <div className="mt-2 space-y-1">
          <p>Total rows: {totalRows}</p>
          <p>Rows with matched work: {matchedWorkCount}</p>
          <p>Rows needing review: {reviewCount}</p>
          <p>Current import job status: {importJobStatus || "-"}</p>
        </div>

        {isCompleted && isFullyAllocated ? (
          <p className="mt-3 text-emerald-700 font-semibold">
            ✅ Allocation completed successfully. All {totalRows} rows allocated.
          </p>
        ) : isBusy ? (
          <p className="mt-3 text-amber-700">
            This import is currently processing. Wait until it finishes before running the
            next step.
          </p>
        ) : matchedWorkCount === 0 ? (
          <p className="mt-3 text-amber-700">
            Allocation is disabled because there are no matched rows yet.
          </p>
        ) : (
          <p className="mt-3 text-emerald-700">
            Allocation can run. Unmatched or review rows will remain blocked and will not
            stop allocation for already matched rows.
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <RunImportParseButton
          companySlug={companySlug}
          importJobId={importJobId}
          disabled={isCompleted}
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
          disabled={!canRunAllocation || isCompleted}
        />
      </div>

      {/* Match review table */}
      <MatchReviewTable companySlug={companySlug} importJobId={importJobId} />

      {/* Allocation summary */}
      <AllocationRunSummary importJobId={importJobId} />
    </div>
  );
}