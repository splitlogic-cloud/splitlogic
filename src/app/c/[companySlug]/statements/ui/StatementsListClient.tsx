"use client";

// src/app/c/[companySlug]/statements/StatementsListClient.tsx
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StatementListRow } from "@/features/statements/statements.repo";

function formatMoney(v: number | null | undefined, currency?: string | null) {
  const n = typeof v === "number" ? v : 0;
  const cur = currency || "";
  return `${n.toFixed(2)} ${cur}`.trim();
}

function periodLabel(r: StatementListRow) {
  if (r.period) return r.period;
  if (r.period_start || r.period_end) return `${r.period_start ?? "?"} → ${r.period_end ?? "?"}`;
  return "—";
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = (status ?? "draft").toLowerCase();

  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";
  const cls =
    s === "paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "sent"
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : s === "void"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-slate-50 text-slate-700 border-slate-200";

  return <span className={`${base} ${cls}`}>{s}</span>;
}

export default function StatementsListClient({
  companySlug,
  initialRows,
  initialStatus,
  initialQ,
}: {
  companySlug: string;
  initialRows: StatementListRow[];
  initialStatus: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus || "");
  const [q, setQ] = useState(initialQ || "");

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return initialRows;
    return initialRows.filter((r) => (r.party_name ?? "").toLowerCase().includes(qq));
  }, [initialRows, q]);

  function applyFilters() {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (q.trim()) sp.set("q", q.trim());
    router.push(`/c/${companySlug}/statements?${sp.toString()}`);
    router.refresh();
  }

  function clearFilters() {
    setStatus("");
    setQ("");
    router.push(`/c/${companySlug}/statements`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Status</label>
            <select
              className="h-10 rounded-md border px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="draft">draft</option>
              <option value="sent">sent</option>
              <option value="paid">paid</option>
              <option value="void">void</option>
            </select>
          </div>

          <div className="flex flex-1 flex-col gap-1 min-w-[220px]">
            <label className="text-xs text-slate-500">Sök part</label>
            <input
              className="h-10 rounded-md border px-3 text-sm"
              placeholder="t.ex. Artist AB"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <button
            onClick={applyFilters}
            className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white"
          >
            Apply
          </button>
          <button onClick={clearFilters} className="h-10 rounded-md border px-4 text-sm font-medium">
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-sm font-medium">Statements</div>
          <div className="text-xs text-slate-500">{rows.length} st</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-sm text-slate-600">
            Inga statements ännu. Skapa via din lifecycle/RPC och refresh sidan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Period</th>
                  <th className="px-4 py-2 text-left font-medium">Part</th>
                  <th className="px-4 py-2 text-right font-medium">Gross</th>
                  <th className="px-4 py-2 text-right font-medium">Recoup</th>
                  <th className="px-4 py-2 text-right font-medium">Payable</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Locked</th>
                  <th className="px-4 py-2 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const locked = Boolean(r.allocation_locked_at || r.recoup_locked_at);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 whitespace-nowrap">{periodLabel(r)}</td>
                      <td className="px-4 py-2">{r.party_name ?? r.party_id ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.gross_amount, r.currency)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatMoney(r.recouped_amount, r.currency)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatMoney(r.payable_amount, r.currency)}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={r.status ?? "draft"} />
                      </td>
                      <td className="px-4 py-2">
                        {locked ? <span title="Locked runs">🔒</span> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/c/${companySlug}/statements/${r.id}`}
                          className="inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}