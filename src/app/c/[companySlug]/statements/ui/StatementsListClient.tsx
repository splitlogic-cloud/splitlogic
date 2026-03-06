"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createStatementFromDates } from "../actions";

type AnyRow = Record<string, any>;
type PartyMini = { id: string; name: string };

type NormalizedRow = {
  id: string;
  company_id?: string | null;
  party_id?: string | null;

  status?: string | null;
  created_at?: string | null;

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

function CreateStatementCard(props: { companySlug: string; parties: PartyMini[] }) {
  const { companySlug, parties } = props;
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 relative z-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">Create statement</div>
          <div className="text-sm text-slate-500">
            Generate statement lines from revenue_rows for a date range (net/gross) and optionally assign a Party.
          </div>
        </div>

        <button
          type="button"
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="mt-4">
          <form action={createStatementFromDates.bind(null, companySlug)}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <div>
                <label className="text-xs font-medium text-slate-600">Period start</label>
                <input
                  type="date"
                  name="period_start"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Period end</label>
                <input
                  type="date"
                  name="period_end"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Amount</label>
                <select
                  name="amount_field"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  defaultValue="net"
                >
                  <option value="net">Net</option>
                  <option value="gross">Gross</option>
                </select>
              </div>

              {/* ✅ PARTY DROPDOWN (punkt 2.4) */}
              <div>
                <label className="text-xs font-medium text-slate-600">Party</label>
                <select
                  name="party_id"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">(No party)</option>
                  {(parties ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50"
                >
                  Generate
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function StatementsListClient(props: {
  companySlug: string;
  initialRows: AnyRow[];
  parties: PartyMini[];
  initialStatus?: string;
  initialQ?: string;
}) {
  const { companySlug, initialRows, parties, initialStatus = "", initialQ = "" } = props;

  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);

  const partyMap = useMemo(() => {
    const m = new Map<string, string>();
    (parties ?? []).forEach((p) => m.set(p.id, p.name));
    return m;
  }, [parties]);

  const rows = useMemo(() => (initialRows ?? []).map(normalizeRow).filter((r) => r.id), [initialRows]);

  const filtered = useMemo(() => {
    const qs = q.trim().toLowerCase();
    return rows.filter((r) => {
      const okStatus = status ? (r.status ?? "") === status : true;

      const partyName = r.party_id ? partyMap.get(r.party_id) ?? "" : "";
      const okQ = qs
        ? partyName.toLowerCase().includes(qs) || (r.id ?? "").toLowerCase().includes(qs)
        : true;

      return okStatus && okQ;
    });
  }, [rows, status, q, partyMap]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-slate-600">Status</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">Alla</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
            <option value="voided">Voided</option>
          </select>

          <div className="ml-3 text-xs font-medium text-slate-600">Sök</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök part eller statement-id…"
            className="h-10 w-full sm:w-72 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          />
        </div>

        <div className="text-sm text-slate-500">{filtered.length} st</div>
      </div>

      {/* Create statement */}
      <CreateStatementCard companySlug={companySlug} parties={parties} />

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
            {filtered.map((r) => {
              const partyName = r.party_id ? partyMap.get(r.party_id) : null;

              return (
                <Link
                  key={r.id}
                  href={`/c/${companySlug}/statements/${r.id}`}
                  className="grid grid-cols-12 gap-3 px-4 py-4 hover:bg-slate-50 transition"
                >
                  <div className="col-span-6 min-w-0">
                    <div className="font-medium truncate">{partyName ?? "Unknown party"}</div>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}