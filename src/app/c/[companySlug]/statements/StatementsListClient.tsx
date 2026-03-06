"use client";

import Link from "next/link";

type StatementRow = {
  id: string;
  partyName: string;
  periodLabel: string;
  amountLabel: string;
  status: string;
};

export default function StatementsListClient({
  companySlug,
  rows,
}: {
  companySlug: string;
  rows: StatementRow[];
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[1.6fr_0.8fr_1fr_0.9fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
        <div>Party</div>
        <div>Period</div>
        <div>Amount</div>
        <div>Status</div>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-8 text-sm text-slate-500">
          No statements yet.
        </div>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1.6fr_0.8fr_1fr_0.9fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
          >
            <div>
              <div className="font-medium text-slate-900">{row.partyName}</div>
              <div className="text-sm text-slate-500">{row.id}</div>
            </div>

            <div className="text-sm text-slate-600">{row.periodLabel}</div>

            <div className="text-sm text-slate-600">{row.amountLabel}</div>

            <div>
              <span className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                {row.status}
              </span>
            </div>
          </div>
        ))
      )}

      <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
        <Link
          href={`/c/${companySlug}/dashboard`}
          className="text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}