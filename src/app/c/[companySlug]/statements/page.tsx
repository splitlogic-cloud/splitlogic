import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listStatementsByCompany } from "@/features/statements/statements.repo";
import {
  listStatementQaStatusesByCompany,
  type QaLevel,
  type StatementQaStatusRow,
} from "@/features/statements/statements-qa.repo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
  searchParams?: Promise<{
    success?: string;
  }>;
};

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

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null) return "—";

  const rounded = new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return currency ? `${rounded} ${currency}` : rounded;
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildQaMap(rows: StatementQaStatusRow[]): Map<string, StatementQaStatusRow> {
  return new Map(rows.map((row) => [row.statement_id, row]));
}

export default async function StatementsPage({ params, searchParams }: PageProps) {
  const { companySlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const successMessage = resolvedSearchParams.success ?? "";

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const [statements, qaRows] = await Promise.all([
    listStatementsByCompany(company.id),
    listStatementQaStatusesByCompany(company.id),
  ]);

  const qaMap = buildQaMap(qaRows);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">
            <Link href={`/c/${companySlug}`} className="underline">
              Dashboard
            </Link>{" "}
            / Statements
          </div>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Statements
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            Review generated statements, inspect QA status, open detail views,
            export PDFs, and batch-export statement data.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/c/${companySlug}/statements/generate`}
            className="inline-flex items-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Generate statements
          </Link>

          <Link
            href={`/c/${companySlug}/statements/batch-export`}
            className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium"
          >
            Batch export
          </Link>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Total statements
          </div>
          <div className="mt-2 text-lg font-semibold">{statements.length}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            QA blocked
          </div>
          <div className="mt-2 text-lg font-semibold">
            {qaRows.filter((row) => row.level === "blocked").length}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            QA warnings
          </div>
          <div className="mt-2 text-lg font-semibold">
            {qaRows.filter((row) => row.level === "warning").length}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            QA ok
          </div>
          <div className="mt-2 text-lg font-semibold">
            {qaRows.filter((row) => row.level === "ok").length}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 text-sm font-medium">
          Statement list
        </div>

        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Party
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Period
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                QA
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Total
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Created
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {statements.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No statements found.
                </td>
              </tr>
            ) : (
              statements.map((row) => {
                const qa = qaMap.get(row.id);

                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{row.party_name ?? "—"}</td>

                    <td className="px-4 py-3">
                      {row.period_start ?? "—"} → {row.period_end ?? "—"}
                    </td>

                    <td className="px-4 py-3">{row.status ?? "—"}</td>

                    <td className="px-4 py-3">
                      {qa ? (
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(
                            qa.level
                          )}`}
                        >
                          {badgeLabel(qa.level)}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {formatMoney(row.total_amount, row.currency)}
                    </td>

                    <td className="px-4 py-3">{formatDate(row.created_at)}</td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/c/${companySlug}/statements/${row.id}`}
                          className="underline"
                        >
                          Open
                        </Link>

                        <Link
                          href={`/c/${companySlug}/statements/${row.id}/pdf`}
                          className="underline"
                        >
                          PDF
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}