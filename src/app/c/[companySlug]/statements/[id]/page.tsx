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
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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

export default async function StatementDetailPage({ params }: Params) {
  const { companySlug, id } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,slug,name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const statement = await getStatementById(company.id, id);
  if (!statement) {
    notFound();
  }

  const qa = await getStatementQaDetail(company.id, id);

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
            {formatDate(statement.period_start)} → {formatDate(statement.period_end)}
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Total</div>
          <div className="text-2xl font-semibold">
            {formatMoney(statement.total_amount, statement.currency)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Status</div>
          <div className="mt-2 text-lg font-semibold">{statement.status}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Run status</div>
          <div className="mt-2 text-lg font-semibold">{statement.run_status ?? "—"}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Line count</div>
          <div className="mt-2 text-lg font-semibold">{statement.line_count}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Currency</div>
          <div className="mt-2 text-lg font-semibold">{statement.currency}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Created</div>
          <div className="mt-2 text-lg font-semibold">
            {formatDateTime(statement.created_at)}
          </div>
        </div>
      </div>

      {qa ? (
        <div className="space-y-4 rounded-2xl border bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">QA summary</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Validates statement totals against frozen statement lines.
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
                Lines total
              </div>
              <div className="mt-2 text-lg font-semibold">
                {formatMoney(qa.lineTotal, statement.currency)}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                Diff
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
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">Issues</div>
            {qa.issues.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-600">No obvious issues detected.</div>
            ) : (
              <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                {qa.issues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 text-sm font-medium">Frozen statement lines</div>
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Date</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Title</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Artist</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">ISRC</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Platform</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Territory</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Amount</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {statement.lines.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No statement lines found.
                </td>
              </tr>
            ) : (
              statement.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3">{formatDate(line.transaction_date)}</td>
                  <td className="px-4 py-3">{line.title ?? "—"}</td>
                  <td className="px-4 py-3">{line.artist ?? "—"}</td>
                  <td className="px-4 py-3">{line.isrc ?? "—"}</td>
                  <td className="px-4 py-3">{line.platform ?? "—"}</td>
                  <td className="px-4 py-3">{line.territory ?? "—"}</td>
                  <td className="px-4 py-3">{formatMoney(line.amount, line.currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
