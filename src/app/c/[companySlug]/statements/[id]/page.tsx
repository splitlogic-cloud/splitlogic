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
  allocation_run_id: string | null;
  recoup_run_id: string | null;
  status: "draft" | "sent" | "paid" | "void" | string;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  note: string | null;
  created_at: string;
  export_hash: string | null;
};

type RawLine = {
  work_id: string | null;
  party_id: string | null;
  currency: string | null;
  gross_amount: number | string | null;
  recouped_amount: number | string | null;
  payable_amount: number | string | null;
};

type Line = {
  work_id: string | null;
  party_id: string | null;
  currency: string;
  gross_amount: number;
  recouped_amount: number;
  payable_amount: number;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number) {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num(n));
}

function dt(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("sv-SE");
}

function badge(status: string) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";

  if (status === "draft") {
    return `${base} bg-amber-50 border-amber-200 text-amber-700`;
  }
  if (status === "sent") {
    return `${base} bg-sky-50 border-sky-200 text-sky-700`;
  }
  if (status === "paid") {
    return `${base} bg-emerald-50 border-emerald-200 text-emerald-700`;
  }
  if (status === "void") {
    return `${base} bg-rose-50 border-rose-200 text-rose-700`;
  }

  return `${base} bg-slate-50 border-slate-200 text-slate-700`;
}

export default async function StatementDetailPage({
  params,
}: {
  params: { companySlug: string; id: string };
}) {
  const supabase = await createSupabaseServerClient();
  const company = await requireCompanyBySlugForUser(params.companySlug);

  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select(
      `
        id,
        company_id,
        allocation_run_id,
        recoup_run_id,
        status,
        sent_at,
        paid_at,
        voided_at,
        note,
        created_at,
        export_hash
      `
    )
    .eq("company_id", company.id)
    .eq("id", params.id)
    .maybeSingle();

  if (statementError) {
    throw new Error(`load statement failed: ${statementError.message}`);
  }

  if (!statement) {
    notFound();
  }

  const st = statement as Statement;

  const { data: rawLines, error: linesError } = await supabase
    .from("statement_lines_v1")
    .select(
      `
        work_id,
        party_id,
        currency,
        gross_amount,
        recouped_amount,
        payable_amount
      `
    )
    .eq("company_id", company.id)
    .eq("statement_id", st.id)
    .limit(5000);

  if (linesError) {
    throw new Error(`load statement lines failed: ${linesError.message}`);
  }

  const rows: Line[] = ((rawLines ?? []) as RawLine[]).map((r) => ({
    work_id: r.work_id ?? null,
    party_id: r.party_id ?? null,
    currency: r.currency ?? "SEK",
    gross_amount: num(r.gross_amount),
    recouped_amount: num(r.recouped_amount),
    payable_amount: num(r.payable_amount),
  }));

  const currency = rows[0]?.currency ?? "SEK";
  const totalGross = rows.reduce((sum, row) => sum + row.gross_amount, 0);
  const totalRecouped = rows.reduce((sum, row) => sum + row.recouped_amount, 0);
  const totalPayable = rows.reduce((sum, row) => sum + row.payable_amount, 0);

  const workIds = Array.from(
    new Set(rows.map((r) => r.work_id).filter(Boolean))
  ) as string[];

  const partyIds = Array.from(
    new Set(rows.map((r) => r.party_id).filter(Boolean))
  ) as string[];

  let worksMap = new Map<string, string>();
  let partiesMap = new Map<string, string>();

  if (workIds.length > 0) {
    const { data: works, error: worksError } = await supabase
      .from("works")
      .select("id, title")
      .in("id", workIds)
      .limit(5000);

    if (worksError) {
      throw new Error(`load works failed: ${worksError.message}`);
    }

    worksMap = new Map<string, string>(
      (works ?? []).map((w: any) => [w.id, w.title ?? "Untitled work"])
    );
  }

  if (partyIds.length > 0) {
    const { data: parties, error: partiesError } = await supabase
      .from("parties")
      .select("id, name")
      .in("id", partyIds)
      .limit(5000);

    if (partiesError) {
      throw new Error(`load parties failed: ${partiesError.message}`);
    }

    partiesMap = new Map<string, string>(
      (parties ?? []).map((p: any) => [p.id, p.name ?? "Unknown party"])
    );
  }

  const grouped = new Map<
    string,
    {
      workId: string;
      workTitle: string;
      total: number;
      lineCount: number;
      lines: Array<{
        partyId: string | null;
        partyName: string;
        gross: number;
        recoup: number;
        payable: number;
      }>;
    }
  >();

  for (const row of rows) {
    const workId = row.work_id ?? "unknown-work";
    const workTitle =
      row.work_id && worksMap.has(row.work_id)
        ? worksMap.get(row.work_id)!
        : row.work_id
          ? row.work_id
          : "Unknown work";

    const existing = grouped.get(workId) ?? {
      workId,
      workTitle,
      total: 0,
      lineCount: 0,
      lines: [],
    };

    existing.lines.push({
      partyId: row.party_id,
      partyName:
        row.party_id && partiesMap.has(row.party_id)
          ? partiesMap.get(row.party_id)!
          : row.party_id
            ? row.party_id
            : "Unknown party",
      gross: row.gross_amount,
      recoup: row.recouped_amount,
      payable: row.payable_amount,
    });

    existing.total += row.payable_amount;
    existing.lineCount += 1;

    grouped.set(workId, existing);
  }

  const workBlocks = Array.from(grouped.values()).sort((a, b) => b.total - a.total);
  const uniquePartyCount = new Set(rows.map((r) => r.party_id).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500">
            <Link
              href={`/c/${company.slug}/statements`}
              className="hover:underline"
            >
              Statements
            </Link>{" "}
            <span className="text-slate-300">/</span>{" "}
            <span className="font-medium text-slate-700">
              ST-{st.id.slice(0, 6)}
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">Statement</h1>

          <div className="flex flex-wrap items-center gap-2">
            <span className={badge(st.status)}>{st.status.toUpperCase()}</span>
            <span className="text-sm text-slate-500">
              Created {dt(st.created_at)}
            </span>
          </div>
        </div>

        <StatementActions
          companySlug={company.slug}
          statementId={st.id}
          status={st.status}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Total Gross</div>
          <div className="mt-2 text-2xl font-semibold">
            {currency} {money(totalGross)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Total Recouped</div>
          <div className="mt-2 text-2xl font-semibold">
            {currency} {money(totalRecouped)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Net Payable</div>
          <div className="mt-2 text-2xl font-semibold">
            {currency} {money(totalPayable)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Lines</div>
          <div className="mt-2 text-2xl font-semibold">{rows.length}</div>
          <div className="mt-1 text-xs text-slate-500">
            {workBlocks.length} works · {uniquePartyCount} parties
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-sm font-semibold">Work breakdown</div>
            <div className="text-xs text-slate-500">
              {workBlocks.length} works
            </div>
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
            <div className="p-8">
              <div className="text-sm font-medium text-slate-900">
                Statement created, but no lines were generated.
              </div>
              <div className="mt-1 text-sm text-slate-500">
                This usually means there was no matching payable data for the
                selected run or period.
              </div>
              <div className="mt-4">
                <Link
                  href={`/c/${company.slug}/statements`}
                  className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-slate-50"
                >
                  Back to statements
                </Link>
              </div>
            </div>
          ) : (
            workBlocks.map((work) => (
              <div key={work.workId} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {work.workTitle}
                    </div>
                    <div className="text-xs text-slate-500">
                      {work.lineCount} lines
                    </div>
                  </div>

                  <div className="text-sm font-semibold">
                    {currency} {money(work.total)}
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Party</th>
                        <th className="px-3 py-2 text-right font-medium">Gross</th>
                        <th className="px-3 py-2 text-right font-medium">Recoup</th>
                        <th className="px-3 py-2 text-right font-medium">Payable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {work.lines
                        .sort((a, b) => b.payable - a.payable)
                        .map((line, index) => (
                          <tr key={`${work.workId}-${line.partyId ?? "unknown"}-${index}`}>
                            <td className="px-3 py-2">{line.partyName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {money(line.gross)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {money(line.recoup)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {money(line.payable)}
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

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold">Metadata</div>

        <div className="mt-3 grid gap-2 text-sm text-slate-700">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Statement ID</span>
            <span className="font-mono text-xs">{st.id}</span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Allocation run</span>
            <span className="font-mono text-xs">
              {st.allocation_run_id ?? "—"}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Recoup run</span>
            <span className="font-mono text-xs">
              {st.recoup_run_id ?? "—"}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Sent at</span>
            <span>{dt(st.sent_at)}</span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Paid at</span>
            <span>{dt(st.paid_at)}</span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Voided at</span>
            <span>{dt(st.voided_at)}</span>
          </div>

          {st.export_hash ? (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Export hash</span>
              <span className="font-mono text-xs">{st.export_hash}</span>
            </div>
          ) : null}

          {st.note ? (
            <div className="pt-2">
              <div className="text-xs text-slate-500">Note</div>
              <div className="mt-1 whitespace-pre-wrap">{st.note}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}