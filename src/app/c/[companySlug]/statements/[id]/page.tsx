import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStatementById } from "@/features/statements/statements.repo";
import {
  getStatementQaDetail,
  type QaLevel,
} from "@/features/statements/statements-qa.repo";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
    id: string;
  }>;
};

type StatementLineViewModel = {
  id: string;
  line_label: string | null;
  work_title: string | null;
  row_count: number | null;
  amount: number | null;
  currency: string | null;
};

type StatementViewModel = {
  id: string;
  party_name: string | null;
  period_start: string | null;
  period_end: string | null;
  total_amount: number | null;
  currency: string | null;
  status: string | null;
  generated_from: string | null;
  created_at: string | null;
  note: string | null;
  lines: StatementLineViewModel[];
};

function asString(value: unknown): string | null {
  if (value == null) return null;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null) return "—";

  const rounded = new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return currency ? `${rounded} ${currency}` : rounded;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function badgeClass(level: QaLevel) {
  if (level === "ok") return "bg-green-100 text-green-800 border-green-200";
  if (level === "warning") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function badgeLabel(level: QaLevel) {
  if (level === "ok") return "OK";
  if (level === "warning") return "Needs review";
  return "Blocked";
}

function normalizeStatementLine(input: unknown): StatementLineViewModel {
  const row = (input ?? {}) as Record<string, unknown>;

  return {
    id: asString(row.id) ?? cryptoRandomFallback(),
    line_label:
      asString(row.line_label) ??
      asString(row.label) ??
      asString(row.name) ??
      null,
    work_title:
      asString(row.work_title) ??
      asString(row.work_name) ??
      asString(row.title) ??
      null,
    row_count:
      asNumber(row.row_count) ??
      asNumber(row.source_row_count) ??
      asNumber(row.count) ??
      0,
    amount:
      asNumber(row.amount) ??
      asNumber(row.total_amount) ??
      asNumber(row.payable_amount) ??
      null,
    currency: asString(row.currency),
  };
}

function normalizeStatement(input: unknown): StatementViewModel {
  const row = (input ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(row.lines) ? row.lines : [];

  return {
    id: asString(row.id) ?? "",
    party_name: asString(row.party_name),
    period_start: asString(row.period_start),
    period_end: asString(row.period_end),
    total_amount:
      asNumber(row.total_amount) ??
      asNumber(row.amount) ??
      asNumber(row.payable_amount),
    currency: asString(row.currency),
    status: asString(row.status),
    generated_from: asString(row.generated_from),
    created_at: asString(row.created_at),
    note: asString(row.note),
    lines: rawLines.map(normalizeStatementLine),
  };
}

function cryptoRandomFallback() {
  return `line_${Math.random().toString(36).slice(2, 12)}`;
}

export default async function StatementDetailPage({ params }: Params) {
  const { companySlug, id } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,slug,name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    console.error("[StatementDetailPage] company lookup failed", {
      companySlug,
      message: companyError.message,
      details: companyError.details,
      hint: companyError.hint,
      code: companyError.code,
    });
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const statementRaw = await getStatementById(company.id, id);

  if (!statementRaw) {
    notFound();
  }

  const statement = normalizeStatement(statementRaw);

  let qa: Awaited<ReturnType<typeof getStatementQaDetail>> | null = null;

  try {
    qa = await getStatementQaDetail(company.id, id);
  } catch (error) {
    console.error("[StatementDetailPage] getStatementQaDetail failed", {
      companyId: company.id,
      statementId: id,
      error,
    });
    qa = null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">
            <Link href={`/c/${companySlug}/statements`} className="underline">
              Statements
            </Link>{" "}
            / Detail
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {statement.party_name ?? "Statement"}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {statement.period_start ?? "—"} → {statement.period_end ?? "—"}
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Total
          </div>
          <div className="text-2xl font-semibold">
            {formatMoney(statement.total_amount, statement.currency)}
          </div>
        </div>
      </div>

      {qa ? (
        <div className="space-y-4 rounded-2xl border bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">QA Summary</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Validation of totals, linked ledger rows and basic anomalies.
              </p>
            </div>
            <div
              className={`rounded-full border px-3 py-1 text-sm font-medium ${badgeClass(
                qa.level
              )}`}
            >
              {badgeLabel(qa.level)}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Statement total
              </div>
              <div className="mt-2 text-lg font-semibold">
                {formatMoney(qa.statementTotal, statement.currency)}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Ledger total
              </div>
              <div className="mt-2 text-lg font-semibold">
                {formatMoney(qa.ledgerTotal, statement.currency)}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Lines total
              </div>
              <div className="mt-2 text-lg font-semibold">
                {formatMoney(qa.lineTotal, statement.currency)}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Linked source rows
              </div>
              <div className="mt-2 text-lg font-semibold">{qa.sourceRowCount}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Diff vs ledger
              </div>
              <div className="mt-2 text-lg font-semibold">
                {formatMoney(qa.diffVsLedger, statement.currency)}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Diff vs lines
              </div>
              <div className="mt-2 text-lg font-semibold">
                {formatMoney(qa.diffVsLines, statement.currency)}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Missing work rows
              </div>
              <div className="mt-2 text-lg font-semibold">{qa.rowsMissingWork}</div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Currencies
              </div>
              <div className="mt-2 text-lg font-semibold">
                {qa.currencies.length > 0 ? qa.currencies.join(", ") : "—"}
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">Issues</div>
            {qa.issues.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-600">
                No obvious issues detected.
              </div>
            ) : (
              <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                {qa.issues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          QA detail could not be loaded for this statement yet. The statement itself is still
          available.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Status
          </div>
          <div className="mt-2 text-lg font-semibold">
            {statement.status ?? "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Source
          </div>
          <div className="mt-2 text-lg font-semibold">
            {statement.generated_from ?? "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Currency
          </div>
          <div className="mt-2 text-lg font-semibold">
            {statement.currency ?? "Mixed / none"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Created
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatDateTime(statement.created_at)}
          </div>
        </div>
      </div>

      {statement.note ? (
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm font-medium">Note</div>
          <div className="mt-2 text-sm text-neutral-700">{statement.note}</div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 text-sm font-medium">
          Statement lines
        </div>
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Line
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Work
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Row count
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Amount
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {statement.lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  No statement lines found.
                </td>
              </tr>
            ) : (
              statement.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3">{line.line_label ?? "—"}</td>
                  <td className="px-4 py-3">{line.work_title ?? "—"}</td>
                  <td className="px-4 py-3">{line.row_count ?? 0}</td>
                  <td className="px-4 py-3">
                    {formatMoney(line.amount, line.currency ?? statement.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {qa ? (
        <div className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b px-4 py-3 text-sm font-medium">
            Underlying allocation rows (first 50)
          </div>
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">
                  Allocation row
                </th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">
                  Work
                </th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">
                  Amount
                </th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">
                  Currency
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {qa.previewRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    No linked allocation rows found.
                  </td>
                </tr>
              ) : (
                qa.previewRows.map((row) => (
                  <tr key={row.allocationRowId}>
                    <td className="px-4 py-3">{row.earningDate ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.allocationRowId}
                    </td>
                    <td className="px-4 py-3">{row.workId ?? "—"}</td>
                    <td className="px-4 py-3">
                      {formatMoney(row.allocatedAmount, row.currency)}
                    </td>
                    <td className="px-4 py-3">{row.currency ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}