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

type Params = {
  params: Promise<{
    companySlug: string;
    importJobId: string;
  }>;
};

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
    .select("status, matched_work_id")
    .eq("import_job_id", importJobId);

  if (statusRowsError) {
    throw new Error(statusRowsError.message);
  }

  const counts = (statusRows ?? []).reduce<Record<string, number>>((acc, row) => {
    const status = String(row.status ?? "unknown");
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  const totalRows = statusRows?.length ?? 0;
  const parsedCount = counts.parsed ?? 0;
  const matchedCount = counts.matched ?? 0;
  const allocatedCount = counts.allocated ?? 0;
  const invalidCount = counts.invalid ?? 0;
  const needsReviewCount = counts.needs_review ?? 0;
  const unmatchedCount = counts.unmatched ?? 0;
  const reviewCount = invalidCount + needsReviewCount + unmatchedCount;

  const matchedWorkCount =
    statusRows?.filter((row) => row.matched_work_id != null).length ?? 0;

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