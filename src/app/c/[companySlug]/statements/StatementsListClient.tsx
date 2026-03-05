"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type AnyRow = Record<string, any>;

type NormalizedRow = {
  id: string;
  company_id?: string | null;
  party_id?: string | null;

  status?: string | null;
  created_at?: string | null;

  party_name?: string | null;
  work_count?: number | null;
  earned_net?: number | null;
  currency?: string | null;
};

function pickId(r: AnyRow) {
  return String(r.id ?? r.statement_id ?? r.statementId ?? "");
}

function normalizeRow(r: AnyRow): NormalizedRow {
  return {
    id: pickId(r),
    company_id: r.company_id ?? r.companyId ?? null,
    party_id: r.party_id ?? r.partyId ?? null,

    status: r.status ?? null,
    created_at: r.created_at ?? r.createdAt ?? null,

    party_name: r.party_name ?? r.partyName ?? r.name ?? null,
    work_count: r.work_count ?? r.works ?? r.workCount ?? null,
    earned_net: r.earned_net ?? r.net ?? r.amount_net ?? null,
    currency: r.currency ?? null,
  };
}

function formatMoney(v: any, currency?: string | null) {
  const n = typeof v === "number" ? v : v ? Number(v) : 0;
  const cur = currency ?? "kr";
  try {
    return new Intl.NumberFormat("sv-SE").format(n) + " " + cur;
  } catch {
    return `${n} ${cur}`;
  }
}

export default function StatementsListClient(props: {
  companySlug: string;
  initialRows: AnyRow[]; // ✅ accept whatever server returns
  initialStatus?: string;
  initialQ?: string;
}) {
  const { companySlug, initialRows, initialStatus = "", initialQ = "" } = props;

  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);

  const rows = useMemo(() => (initialRows ?? []).map(normalizeRow).filter((r) => r.id), [initialRows]);

  const filtered = useMemo(() => {
    const qs = q.trim().toLowerCase();
    return rows.filter((r) => {
      const okStatus = status ? (r.status ?? "") === status : true;
      const okQ = qs
        ? (r.party_name ?? "").toLowerCase().includes(qs) || (r.id ?? "").toLowerCase().includes(qs)
        : true;
      return okStatus && okQ;
    });
  }, [rows, status, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search party or statement…"
            className="h-10 w-full sm:w-72 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          />
        </div>

        <div className="text-sm text-slate-500">{filtered.length} statements</div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500 border-b border-slate-100">
          <div className="col-span-6">Party</div>
          <div className="col-span-2">Works</div>
          <div className="col-span-2 text-right">Net</div>
          <div className="col-span-2 text-right">Status</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No statements found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/c/${companySlug}/statements/${r.id}`}
                className="grid grid-cols-12 gap-3 px-4 py-4 hover:bg-slate-50 transition"
              >
                <div className="col-span-6 min-w-0">
                  <div className="font-medium truncate">{r.party_name ?? "Unknown party"}</div>
                  <div className="text-xs text-slate-500 truncate">{r.id}</div>
                </div>

                <div className="col-span-2 text-sm text-slate-700">{r.work_count ?? "—"}</div>
                <div className="col-span-2 text-sm text-slate-900 text-right">
                  {r.earned_net != null ? formatMoney(r.earned_net, r.currency) : "—"}
                </div>

                <div className="col-span-2 text-right">
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    {r.status ?? "—"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}