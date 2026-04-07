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
  companyId,
  importJobId,
}: {
  companyId: string;
  importJobId: string;
}) {
  const run = await getLatestAllocationRunForImport({
    companyId,
    importJobId,
  });

  if (!run) {
    return null;
  }

  const finishedAt = run.completed_at ?? run.failed_at ?? run.created_at;

  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">
        Latest allocation run
      </h2>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Status
          </div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {run.status}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Allocated rows (this run)
          </div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {run.allocated_row_count} / {run.input_row_count}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Blocked rows
          </div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {run.blocked_row_count}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Total net
          </div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {formatNumber(run.net_amount_total)}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Total gross
          </div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {formatNumber(run.gross_amount_total)}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Finished
          </div>
          <div className="mt-2 text-lg font-semibold text-gray-900">
            {formatDateTime(finishedAt)}
          </div>
        </div>
      </div>
    </section>
  );
}