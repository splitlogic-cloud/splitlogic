"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type AnyRow = Record<string, any>;

export type StatementListRow = {
  id: string;
  company_id?: string | null;
  party_id?: string | null;

  // visning
  party_name?: string | null;
  currency?: string | null;
  earned_net?: number | string | null;

  // status
  status?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;

  created_at?: string | null;
};

function toRow(r: AnyRow): StatementListRow {
  return {
    id: String(r.id),
    company_id: r.company_id ?? null,
    party_id: r.party_id ?? null,

    party_name: r.party_name ?? r.name ?? null,
    currency: r.currency ?? null,
    earned_net: r.earned_net ?? r.amount_net ?? r.net_payable ?? null,

    status: r.status ?? null,
    sent_at: r.sent_at ?? null,
    paid_at: r.paid_at ?? null,
    voided_at: r.voided_at ?? null,

    created_at: r.created_at ?? null,
  };
}

function formatMoney(v: any, currency?: string | null) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  const cur = currency ?? "";
  // enkel och stabil
  return `${cur} ${Math.round(n).toLocaleString("sv-SE")}`.trim();
}

function badge(status?: string | null) {
  const s = (status ?? "draft").toLowerCase();
  const base = "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium";
  if (s === "paid") return `${base} bg-emerald-100 text-emerald-800`;
  if (s === "sent") return `${base} bg-sky-100 text-sky-800`;
  if (s === "void") return `${base} bg-slate-200 text-slate-700`;
  return `${base} bg-amber-100 text-amber-800`; // draft
}

export default function StatementsListClient({
  companySlug,
  initialRows,
  initialStatus,
  initialQ,
}: {
  companySlug: string;
  initialRows: AnyRow[]; // ✅ här är fixen
  initialStatus?: string;
  initialQ?: string;
}) {
  const [status, setStatus] = useState(initialStatus ?? "");
  const [q, setQ] = useState(initialQ ?? "");

  const rows = useMemo(() => (initialRows ?? []).map(toRow), [initialRows]);

  const filtered = useMemo(() => {
    const s = status.trim().toLowerCase();
    const qq = q.trim().toLowerCase();

    return rows.filter((r) => {
      const okStatus = !s || (r.status ?? "draft").toLowerCase() === s;
      const okQ =
        !qq ||
        (r.party_name ?? "").toLowerCase().includes(qq) ||
        (r.id ?? "").toLowerCase().includes(qq);
      return okStatus && okQ;
    });
  }, [rows, status, q]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          <div>
            <div className="text-xs text-slate-500 mb-1">Status</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
            >
              <option value="">Alla</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
          </div>

          <div className="flex-1 min-w-[220px]">
            <div className="text-xs text-slate-500 mb-1">Sök</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sök part eller statement-id..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>

        <div className="text-xs text-slate-500">
          {filtered.length} st
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="font-semibold tracking-tight">Statements</div>
          <div className="text-xs text-slate-500">Revisionssäkert · låsbart</div>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/c/${companySlug}/statements/${r.id}`}
              className="block hover:bg-slate-50"
            >
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {r.party_name ?? "Unknown party"}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {r.id}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold tabular-nums">
                    {formatMoney(r.earned_net, r.currency)}
                  </div>
                  <span className={badge(r.status)}>{(r.status ?? "draft").toUpperCase()}</span>
                </div>
              </div>
            </Link>
          ))}

          {filtered.length === 0 && (
            <div className="px-4 py-8 text-sm text-slate-500">
              Inga statements matchar filtret.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}