import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listAllocationRunsByCompany } from "@/features/allocations/allocations.repo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

type ImportJobLookupRow = {
  id: string;
  file_name: string | null;
  created_at: string | null;
};

function formatMoney(value: number | null, currency: string | null) {
  if (value == null) return "—";

  try {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: currency || "SEK",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusBadgeClass(status: string | null) {
  switch (status) {
    case "completed":
      return "border-green-200 bg-green-100 text-green-800";
    case "processing":
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "failed":
      return "border-red-200 bg-red-100 text-red-800";
    case "pending":
      return "border-yellow-200 bg-yellow-100 text-yellow-800";
    default:
      return "border-neutral-200 bg-neutral-100 text-neutral-700";
  }
}

export default async function AllocationsPage({ params }: PageProps) {
  const { companySlug } = await params;

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

  const runs = await listAllocationRunsByCompany({
    companyId: company.id,
  });

  const importJobIds = [
    ...new Set(
      runs
        .map((run) => run.import_job_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  let importsById = new Map<string, ImportJobLookupRow>();

  if (importJobIds.length > 0) {
    const { data: importJobs, error: importJobsError } = await supabaseAdmin
      .from("import_jobs")
      .select("id, file_name, created_at")
      .eq("company_id", company.id)
      .in("id", importJobIds);

    if (importJobsError) {
      throw new Error(`Failed to load import jobs: ${importJobsError.message}`);
    }

    importsById = new Map(
      (importJobs ?? []).map((job) => [
        String(job.id),
        {
          id: String(job.id),
          file_name: job.file_name ? String(job.file_name) : null,
          created_at: job.created_at ? String(job.created_at) : null,
        },
      ]),
    );
  }

  const completedCount = runs.filter((run) => run.status === "completed").length;
  const processingCount = runs.filter((run) => run.status === "processing").length;
  const failedCount = runs.filter((run) => run.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">
            <Link href={`/c/${companySlug}/dashboard`} className="underline">
              Dashboard
            </Link>{" "}
            / Allocations
          </div>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Allocation runs
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            Review all allocation runs for this company, inspect their source
            import jobs, and open detailed allocation output per run.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Total runs
          </div>
          <div className="mt-2 text-lg font-semibold">{runs.length}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Completed
          </div>
          <div className="mt-2 text-lg font-semibold">{completedCount}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Processing
          </div>
          <div className="mt-2 text-lg font-semibold">{processingCount}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Failed
          </div>
          <div className="mt-2 text-lg font-semibold">{failedCount}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 text-sm font-medium">
          Allocation run history
        </div>

        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Import job
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Engine
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Rows
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Allocated
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Unallocated
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Blockers
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Created
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-neutral-500">
                  No allocation runs found.
                </td>
              </tr>
            ) : (
              runs.map((run) => {
                const importJob = run.import_job_id
                  ? importsById.get(run.import_job_id)
                  : null;

                return (
                  <tr key={run.id}>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadgeClass(
                          run.status,
                        )}`}
                      >
                        {run.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {run.import_job_id ? (
                        <div className="space-y-1">
                          <div className="font-medium">
                            {importJob?.file_name ?? run.import_job_id}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {run.import_job_id}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-4 py-3">{run.engine_version ?? "—"}</td>

                    <td className="px-4 py-3">
                      {run.allocated_row_count} / {run.input_row_count}
                    </td>

                    <td className="px-4 py-3">
                      {formatMoney(run.allocated_amount_total, run.currency)}
                    </td>

                    <td className="px-4 py-3">
                      {formatMoney(run.unallocated_amount_total, run.currency)}
                    </td>

                    <td className="px-4 py-3">{run.blocker_count}</td>

                    <td className="px-4 py-3">{formatDateTime(run.created_at)}</td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/c/${companySlug}/allocations/${run.id}`}
                          className="underline"
                        >
                          Open
                        </Link>

                        {run.import_job_id ? (
                          <Link
                            href={`/c/${companySlug}/imports/${run.import_job_id}`}
                            className="underline"
                          >
                            Import
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}