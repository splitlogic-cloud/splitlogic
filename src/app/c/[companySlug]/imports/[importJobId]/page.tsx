import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import RunAllocationButton from "./RunAllocationButton";
import {
  getCompanyBySlug,
  getImportJobForCompany,
  getLatestAllocationRunForImport,
  listAllocationBlockersForImport,
  listAllocationTotalsByParty,
} from "@/features/allocations/allocations.repo";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
    importJobId: string;
  }>;
};

function formatMoney(value: number, currency?: string | null) {
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

async function getImportRowStats(companyId: string, importJobId: string) {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("id, amount, matched_work_id, allocation_status", { count: "exact" })
    .eq("company_id", companyId)
    .eq("import_job_id", importJobId);

  if (error) {
    throw new Error(`Failed to load import row stats: ${error.message}`);
  }

  const rows = data ?? [];
  const rowCount = rows.length;
  const matchedCount = rows.filter((row) => row.matched_work_id).length;
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return {
    rowCount,
    matchedCount,
    totalAmount,
  };
}

export default async function ImportDetailPage({ params }: Params) {
  const { companySlug, importJobId } = await params;

  const company = await getCompanyBySlug(companySlug);
  if (!company) notFound();

  const importJob = await getImportJobForCompany(company.id, importJobId);
  if (!importJob) notFound();

  const stats = await getImportRowStats(company.id, importJobId);
  const latestRun = await getLatestAllocationRunForImport(company.id, importJobId);
  const totalsByParty = await listAllocationTotalsByParty(
    company.id,
    importJobId,
    latestRun?.id ?? null
  );
  const blockers = await listAllocationBlockersForImport(
    company.id,
    importJobId,
    latestRun?.id ?? null
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-sm text-neutral-500">
            <Link href={`/c/${companySlug}/imports`} className="underline">
              Imports
            </Link>{" "}
            / {importJob.file_name ?? importJob.id}
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            Import allocation
          </h1>

          <p className="max-w-3xl text-sm text-neutral-600">
            This page shows the full allocation status for the import. The engine
            allocates each matched import row to work splits, stores a full run
            history, and logs blockers for anything that cannot be safely allocated.
          </p>
        </div>

        <RunAllocationButton
          companySlug={companySlug}
          importJobId={importJobId}
        />
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase text-neutral-500">Import rows</div>
          <div className="mt-2 text-2xl font-semibold">{stats.rowCount}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase text-neutral-500">Matched rows</div>
          <div className="mt-2 text-2xl font-semibold">{stats.matchedCount}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase text-neutral-500">Gross imported</div>
          <div className="mt-2 text-2xl font-semibold">
            {formatMoney(stats.totalAmount, latestRun?.currency ?? "SEK")}
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase text-neutral-500">Latest run status</div>
          <div className="mt-2 text-2xl font-semibold">
            {latestRun?.status ?? "not run"}
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Latest allocation run</h2>

        {!latestRun ? (
          <p className="mt-3 text-sm text-neutral-600">
            No allocation run exists yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-6">
            <div>
              <div className="text-xs uppercase text-neutral-500">Run ID</div>
              <div className="mt-1 break-all text-sm">{latestRun.id}</div>
            </div>

            <div>
              <div className="text-xs uppercase text-neutral-500">Engine</div>
              <div className="mt-1 text-sm">{latestRun.engine_version}</div>
            </div>

            <div>
              <div className="text-xs uppercase text-neutral-500">Rows allocated</div>
              <div className="mt-1 text-sm">
                {latestRun.allocated_row_count} / {latestRun.input_row_count}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase text-neutral-500">Blockers</div>
              <div className="mt-1 text-sm">{latestRun.blocker_count}</div>
            </div>

            <div>
              <div className="text-xs uppercase text-neutral-500">Allocated amount</div>
              <div className="mt-1 text-sm">
                {formatMoney(latestRun.allocated_amount, latestRun.currency)}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase text-neutral-500">Unallocated amount</div>
              <div className="mt-1 text-sm">
                {formatMoney(latestRun.unallocated_amount, latestRun.currency)}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Totals by party</h2>
          <div className="text-sm text-neutral-500">
            Latest run aggregation
          </div>
        </div>

        {totalsByParty.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            No allocated lines yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Party</th>
                  <th className="py-2 pr-4 font-medium">Currency</th>
                  <th className="py-2 pr-4 font-medium">Allocated</th>
                  <th className="py-2 pr-4 font-medium">Line count</th>
                </tr>
              </thead>
              <tbody>
                {totalsByParty.map((row) => (
                  <tr key={row.party_id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{row.party_name ?? row.party_id}</td>
                    <td className="py-2 pr-4">{row.currency ?? "-"}</td>
                    <td className="py-2 pr-4">
                      {formatMoney(row.total_allocated_amount, row.currency)}
                    </td>
                    <td className="py-2 pr-4">{row.line_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Allocation blockers</h2>
          <div className="text-sm text-neutral-500">
            Rows the engine refused to allocate automatically
          </div>
        </div>

        {blockers.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            No blockers in latest run.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Severity</th>
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Message</th>
                  <th className="py-2 pr-4 font-medium">Row</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((blocker) => (
                  <tr key={blocker.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-4">{blocker.severity}</td>
                    <td className="py-2 pr-4">{blocker.blocker_code}</td>
                    <td className="py-2 pr-4">{blocker.message}</td>
                    <td className="py-2 pr-4">{blocker.import_row_id ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">What this engine now does</h2>
        <div className="mt-3 space-y-2 text-sm text-neutral-700">
          <p>
            1. Reads all normalized import rows for this import job.
          </p>
          <p>
            2. Checks that each row has amount, currency, and a matched work.
          </p>
          <p>
            3. Loads the active split setup for each matched work from{" "}
            <code>work_splits</code>.
          </p>
          <p>
            4. Refuses allocation if split setup is missing or does not total 100%.
          </p>
          <p>
            5. Writes one allocation line per party share into{" "}
            <code>allocation_run_lines</code>.
          </p>
          <p>
            6. Logs every problem into <code>allocation_run_blockers</code> so QA
            can see exactly what stopped.
          </p>
          <p>
            7. Saves a full run record in <code>allocation_runs</code> so the system
            is rerunnable and auditable.
          </p>
        </div>
      </section>
    </div>
  );
}