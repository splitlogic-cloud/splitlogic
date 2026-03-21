import "server-only";

import { getLatestAllocationRunForImport } from "@/features/allocations/allocations.repo";

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function AllocationRunSummary({
  importJobId,
}: {
  importJobId: string;
}) {
  const run = await getLatestAllocationRunForImport(importJobId);

  if (!run) {
    return null;
  }

  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">Latest allocation run</h2>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Status</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">{run.status}</div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Allocated rows</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {run.allocated_rows} / {run.total_rows}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Blocked rows</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">{run.blocked_rows}</div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Total net</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {formatNumber(run.total_net_amount)}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Total gross</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {formatNumber(run.total_gross_amount)}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Finished</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {formatDateTime(run.finished_at ?? run.created_at)}
          </div>
        </div>
      </div>
    </section>
  );
}