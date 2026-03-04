// src/app/c/[companySlug]/statements/[id]/page.tsx
import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import StatementActions from "./ui/StatementActions";

export const dynamic = "force-dynamic";

type Statement = {
  id: string;
  company_id: string;
  allocation_run_id: string;
  recoup_run_id: string;
  status: "draft" | "sent" | "paid" | "void" | string;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  note: string | null;
  created_at: string;
  export_hash: string | null;
};

type Line = {
  work_id: string;
  party_id: string;
  currency: string;
  gross_amount: number;
  recouped_amount: number;
  payable_amount: number;
};

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(v);
}

function badge(status: string) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";
  if (status === "draft") return `${base} bg-amber-50 border-amber-200 text-amber-700`;
  if (status === "sent") return `${base} bg-sky-50 border-sky-200 text-sky-700`;
  if (status === "paid") return `${base} bg-emerald-50 border-emerald-200 text-emerald-700`;
  if (status === "void") return `${base} bg-rose-50 border-rose-200 text-rose-700`;
  return `${base} bg-slate-50 border-slate-200 text-slate-700`;
}

export default async function StatementDetailPage({
  params,
}: {
  params: { companySlug: string; id: string };
}) {
  const supabase = await createSupabaseServerClient();
  const company = await requireCompanyBySlugForUser(params.companySlug);

  // 1) Load statement
  const { data: statement, error: stErr } = await supabase
    .from("statements")
    .select(
      "id, company_id, allocation_run_id, recoup_run_id, status, sent_at, paid_at, voided_at, note, created_at, export_hash"
    )
    .eq("company_id", company.id)
    .eq("id", params.id)
    .maybeSingle();

  if (stErr) throw new Error(stErr.message);
  if (!statement) return notFound();

  const st = statement as Statement;

  // 2) Load statement lines (canonical view)
  const { data: lines, error: linesErr } = await supabase
    .from("statement_lines_v1")
    .select("work_id, party_id, currency, gross_amount, recouped_amount, payable_amount")
    .eq("company_id", company.id)
    .eq("statement_id", st.id)
    .limit(5000);

  if (linesErr) {
    // If your view name differs or missing: show a clear error
    throw new Error(`load statement_lines_v1 failed: ${linesErr.message}`);
  }

  const rows = (lines ?? []).map((r: any) => ({
    work_id: r.work_id,
    party_id: r.party_id,
    currency: r.currency,
    gross_amount: Number(r.gross_amount ?? 0),
    recouped_amount: Number(r.recouped_amount ?? 0),
    payable_amount: Number(r.payable_amount ?? 0),
  })) as Line[];

  const currency = rows[0]?.currency ?? "SEK";
  const totalGross = rows.reduce((a, r) => a + r.gross_amount, 0);
  const totalRecoup = rows.reduce((a, r) => a + r.recouped_amount, 0);
  const totalPayable = rows.reduce((a, r) => a + r.payable_amount, 0);

  // 3) Enrich names for nicer UI (optional)
  const workIds = Array.from(new Set(rows.map((r) => r.work_id)));
  const partyIds = Array.from(new Set(rows.map((r) => r.party_id)));

  const [{ data: works }, { data: parties }] = await Promise.all([
    supabase.from("works").select("id, title").in("id", workIds).limit(5000),
    supabase.from("parties").select("id, name").in("id", partyIds).limit(5000),
  ]);

  const workMap = new Map<string, string>((works ?? []).map((w: any) => [w.id, w.title ?? "Untitled"]));
  const partyMap = new Map<string, string>((parties ?? []).map((p: any) => [p.id, p.name ?? "Unknown"]));

  // group by work -> party lines
  const grouped = new Map<
    string,
    { workTitle: string; total: number; lines: Array<{ partyName: string; gross: number; recoup: number; payable: number }> }
  >();

  for (const r of rows) {
    const key = r.work_id;
    const g = grouped.get(key) ?? {
      workTitle: workMap.get(r.work_id) ?? r.work_id,
      total: 0,
      lines: [],
    };

    g.lines.push({
      partyName: partyMap.get(r.party_id) ?? r.party_id,
      gross: r.gross_amount,
      recoup: r.recouped_amount,
      payable: r.payable_amount,
    });
    g.total += r.payable_amount;
    grouped.set(key, g);
  }

  const workBlocks = Array.from(grouped.entries())
    .map(([workId, g]) => ({ workId, ...g }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500">
            <Link href={`/c/${company.slug}/statements`} className="hover:underline">
              Statements
            </Link>{" "}
            <span className="text-slate-300">/</span> <span className="font-medium text-slate-700">ST-{st.id.slice(0, 6)}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Statement</h1>
          <div className="flex items-center gap-2">
            <span className={badge(st.status)}>{st.status.toUpperCase()}</span>
            <span className="text-sm text-slate-500">
              Created {new Date(st.created_at).toLocaleString("sv-SE")}
            </span>
          </div>
        </div>

        <StatementActions
          companySlug={company.slug}
          statementId={st.id}
          status={st.status}
        />
      </div>

      {/* Totals cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Total Gross</div>
          <div className="mt-2 text-2xl font-semibold">
            {currency} {money(totalGross)}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Total Recouped</div>
          <div className="mt-2 text-2xl font-semibold">
            {currency} {money(totalRecoup)}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Net Payable</div>
          <div className="mt-2 text-2xl font-semibold">
            {currency} {money(totalPayable)}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-sm font-semibold">Work breakdown</div>
            <div className="text-xs text-slate-500">{workBlocks.length} works</div>
          </div>

          <a
            className="h-9 inline-flex items-center rounded-md border px-3 text-xs font-medium hover:bg-slate-50"
            href={`/api/c/${company.slug}/statements/${st.id}/export.csv`}
          >
            Export CSV
          </a>
        </div>

        <div className="divide-y">
          {workBlocks.length === 0 ? (
            <div className="p-8 text-sm text-slate-600">No lines for this statement.</div>
          ) : (
            workBlocks.map((w) => (
              <div key={w.workId} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{w.workTitle}</div>
                    <div className="text-xs text-slate-500">{w.lines.length} parties</div>
                  </div>
                  <div className="text-sm font-semibold">
                    {currency} {money(w.total)}
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Party</th>
                        <th className="text-right px-3 py-2 font-medium">Gross</th>
                        <th className="text-right px-3 py-2 font-medium">Recoup</th>
                        <th className="text-right px-3 py-2 font-medium">Payable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {w.lines
                        .sort((a, b) => b.payable - a.payable)
                        .map((l, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2">{l.partyName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {money(l.gross)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {money(l.recoup)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {money(l.payable)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold">Metadata</div>
        <div className="mt-3 grid gap-2 text-sm text-slate-700">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Allocation run</span>
            <span className="font-mono text-xs">{st.allocation_run_id}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Recoup run</span>
            <span className="font-mono text-xs">{st.recoup_run_id}</span>
          </div>
          {st.export_hash ? (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Export hash</span>
              <span className="font-mono text-xs">{st.export_hash}</span>
            </div>
          ) : null}
          {st.note ? (
            <div className="pt-2">
              <div className="text-slate-500 text-xs">Note</div>
              <div className="mt-1">{st.note}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}