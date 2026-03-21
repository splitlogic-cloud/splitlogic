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
    .select("id,slug,name")
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

  const { data: statusCounts, error: statusCountsError } = await supabaseAdmin
    .from("import_rows")
    .select("status")
    .eq("import_job_id", importJobId);

  if (statusCountsError) {
    throw new Error(statusCountsError.message);
  }

  const counts = (statusCounts ?? []).reduce<Record<string, number>>((acc, row) => {
    const status = String(row.status ?? "unknown");
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  const hasBlockingRows =
    (counts.invalid ?? 0) > 0 ||
    (counts.needs_review ?? 0) > 0 ||
    (counts.unmatched ?? 0) > 0;

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

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Job status</div>
          <div className="mt-2 text-lg font-semibold">{importJob.status ?? "-"}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Parsed</div>
          <div className="mt-2 text-lg font-semibold">{counts.parsed ?? 0}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Matched</div>
          <div className="mt-2 text-lg font-semibold">{counts.matched ?? 0}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Needs review</div>
          <div className="mt-2 text-lg font-semibold">
            {(counts.needs_review ?? 0) + (counts.unmatched ?? 0) + (counts.invalid ?? 0)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <RunImportParseButton companySlug={companySlug} importJobId={importJobId} />
        <RunMatchingButton
          companySlug={companySlug}
          importJobId={importJobId}
          action={runMatchingAction}
        />
        <RunAllocationButton
          companySlug={companySlug}
          importJobId={importJobId}
          disabled={hasBlockingRows}
        />
      </div>

      <MatchReviewTable companySlug={companySlug} importJobId={importJobId} />

      <AllocationRunSummary importJobId={importJobId} />
    </div>
  );
}