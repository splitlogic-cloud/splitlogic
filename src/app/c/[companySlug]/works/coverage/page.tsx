import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getWorkSplitCoverageSummary,
  listWorkSplitCoverage,
} from "@/features/splits/coverage.repo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
  searchParams?: Promise<{
    importJobId?: string;
    allocationRunId?: string;
  }>;
};

function formatPercentFromBps(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

export default async function WorkCoveragePage({
  params,
  searchParams,
}: PageProps) {
  const { companySlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const importJobId = resolvedSearchParams.importJobId ?? null;
  const allocationRunId = resolvedSearchParams.allocationRunId ?? null;

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

  const [summary, rows] = await Promise.all([
    getWorkSplitCoverageSummary({
      companyId: company.id,
      importJobId,
      allocationRunId,
    }),
    listWorkSplitCoverage({
      companyId: company.id,
      importJobId,
      allocationRunId,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">
            <Link href={`/c/${companySlug}/works`} className="underline">
              Works
            </Link>{" "}
            / Coverage
          </div>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Work split coverage
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            Review which works have split coverage, which are complete at 100%,
            and which still block clean allocation runs.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Total works
          </div>
          <div className="mt-2 text-lg font-semibold">{summary.totalWorks}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            With any splits
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.worksWithAnySplits}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Fully covered
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.worksFullyCovered}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Missing splits
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.worksMissingSplits}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Allocation blockers
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.blockersCount}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 text-sm font-medium">
          Work split coverage
        </div>

        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Work
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Split rows
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Total share
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Coverage
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  No works found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.work_id}>
                  <td className="px-4 py-3">{row.work_title ?? row.work_id}</td>
                  <td className="px-4 py-3">{row.split_count}</td>
                  <td className="px-4 py-3">
                    {formatPercentFromBps(row.total_share_bps)}
                  </td>
                  <td className="px-4 py-3">
                    {row.is_complete ? (
                      <span className="inline-flex rounded-full border border-green-200 bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        Complete
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                        Incomplete
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}