"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  id: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
};

function badge(status: string) {
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";
  if (status === "draft") return `${base} bg-amber-50 border-amber-200 text-amber-700`;
  if (status === "sent") return `${base} bg-sky-50 border-sky-200 text-sky-700`;
  if (status === "paid") return `${base} bg-emerald-50 border-emerald-200 text-emerald-700`;
  if (status === "void") return `${base} bg-rose-50 border-rose-200 text-rose-700`;
  return `${base} bg-slate-50 border-slate-200 text-slate-700`;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("sv-SE");
}

export default function StatementsListClient({
  companySlug,
  initialRows,
  initialStatus,
  initialQ,
}: {
  companySlug: string;
  initialRows: Row[];
  initialStatus: string;
  initialQ: string;
}) {
  const [status, setStatus] = useState(initialStatus ?? "");
  const [q, setQ] = useState(initialQ ?? "");

  const filtered = useMemo(() => {
    const s = (status ?? "").trim();
    const qq = (q ?? "").trim().toLowerCase();
    return (initialRows ?? []).filter((r) => {
      if (s && r.status !== s) return false;
      if (!qq) return true;
      // vi har ingen titel här, så vi söker på id/status
      return r.id.toLowerCase().includes(qq) || r.status.toLowerCase().includes(qq);
    });
  }, [initialRows, status, q]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatus("")}
            className={`h-9 rounded-md border px-3 text-xs font-medium ${status === "" ? "bg-slate-900 text-white border-slate-900" : "bg-white"}`}
          >
            All
          </button>
          {["draft", "sent", "paid", "void"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`h-9 rounded-md border px-3 text-xs font-medium ${
                status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white"
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-9 w-56 rounded-md border px-3 text-sm"
          />
          <a
            className="h-9 inline-flex items-center rounded-md border px-3 text-xs font-medium hover:bg-slate-50"
            href={`/c/${companySlug}/statements?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`}
          >
            Apply
          </a>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-sm font-semibold">Statements</div>
            <div className="text-xs text-slate-500">{filtered.length} items</div>
          </div>
        </div>

        <div className="divide-y">
          {filtered.length === 0 ? (
            <div className="p-8 text-sm text-slate-600">No statements found.</div>
          ) : (
            filtered.map((r) => (
              <Link
                key={r.id}
                href={`/c/${companySlug}/statements/${r.id}`}
                className="block px-5 py-4 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">ST-{r.id.slice(0, 6)}</span>
                      <span className={badge(r.status)}>{r.status.toUpperCase()}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Created: {fmtDate(r.created_at)} · Sent: {fmtDate(r.sent_at)} · Paid: {fmtDate(r.paid_at)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 font-mono">{r.id}</div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}