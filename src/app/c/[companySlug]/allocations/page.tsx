import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

type AllocationRunRow = {
  id: string;
  company_id: string;
  import_id: string | null;
  status: string | null;
  total_input_rows: number | null;
  eligible_rows: number | null;
  allocated_rows: number | null;
  skipped_unmatched_rows: number | null;
  skipped_missing_splits_rows: number | null;
  skipped_invalid_split_rows: number | null;
  created_at: string | null;
};

type ImportJobRow = {
  id: string;
  file_name: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusBadgeClass(status: string | null) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (status === "running") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }
  if (status === "failed") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      {hint ? <div className="mt-1 text-sm text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default async function AllocationsPage({ params }: PageProps) {
  const { companySlug } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`load company failed: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const { data: allocationRuns, error: allocationRunsError } = await supabaseAdmin
    .from("allocation_runs")
    .select(
      `
        id,
        company_id,
        import_id,
        status,
        total_input_rows,
        eligible_rows,
        allocated_rows,
        skipped_unmatched_rows,
        skipped_missing_splits_rows,
        skipped_invalid_split_rows,
        created_at
      `
    )
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (allocationRunsError) {
    throw new Error(`load allocation runs failed: ${allocationRunsError.message}`);
  }

  const typedRuns = (allocationRuns ?? []) as AllocationRunRow[];
  const importIds = typedRuns
    .map((run) => run.import_id)
    .filter((value): value is string => Boolean(value));

  const importsById = new Map<string, ImportJobRow>();

  if (importIds.length > 0) {
    const { data: importJobs, error: importJobsError } = await supabaseAdmin
      .from("import_jobs")
      .select("id, file_name")
      .in("id", importIds);

    if (importJobsError) {
      throw new Error(`load import jobs failed: ${importJobsError.message}`);
    }

    for (const row of (importJobs ?? []) as ImportJobRow[]) {
      importsById.set(row.id, row);
    }
  }

  const totalRuns = typedRuns.length;
  const completedRuns = typedRuns.filter((run) => run.status === "completed").length;
  const runningRuns = typedRuns.filter((run) => run.status === "running").length;
  const failedRuns = typedRuns.filter((run) => run.status === "failed").length;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm text-slate-500">Allocations</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
          Allocation runs
        </h1>
        <div className="mt-2 text-sm text-slate-600">
          {company.name ?? company.slug} · All allocation runs for this workspace
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total runs" value={totalRuns} />
        <StatCard title="Completed" value={completedRuns} />
        <StatCard title="Running" value={runningRuns} />
        <StatCard title="Failed" value={failedRuns} />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Recent runs
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Open a run to inspect QA and party totals.
            </p>
          </div>

          <Link
            href={`/c/${companySlug}/imports`}
            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Go to imports
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Import</th>
                <th className="px-4 py-3 font-medium">Input rows</th>
                <th className="px-4 py-3 font-medium">Eligible</th>
                <th className="px-4 py-3 font-medium">Allocation rows</th>
                <th className="px-4 py-3 font-medium">Skipped unmatched</th>
                <th className="px-4 py-3 font-medium">Skipped bad/missing splits</th>
                <th className="px-4 py-3 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {typedRuns.length > 0 ? (
                typedRuns.map((run) => {
                  const importJob = run.import_id ? importsById.get(run.import_id) : null;

                  return (
                    <tr
                      key={run.id}
                      className="border-t border-slate-100 align-top text-slate-800"
                    >
                      <td className="px-4 py-3">{formatDate(run.created_at)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${statusBadgeClass(
                            run.status
                          )}`}
                        >
                          {run.status ?? "unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {run.import_id ? (
                          <div className="space-y-1">
                            <div className="font-medium text-slate-900">
                              {importJob?.file_name ?? "Import file"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {run.import_id}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">{run.total_input_rows ?? 0}</td>
                      <td className="px-4 py-3">{run.eligible_rows ?? 0}</td>
                      <td className="px-4 py-3">{run.allocated_rows ?? 0}</td>
                      <td className="px-4 py-3">
                        {run.skipped_unmatched_rows ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        {(run.skipped_missing_splits_rows ?? 0) +
                          (run.skipped_invalid_split_rows ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/c/${companySlug}/allocations/${run.id}`}
                            className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                          >
                            Open QA
                          </Link>

                          {run.import_id ? (
                            <Link
                              href={`/c/${companySlug}/imports/${run.import_id}`}
                              className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                            >
                              Open import
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={9}>
                    No allocation runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}