import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateStatementsAction } from "./actions";
import {
  getGenerateStatementsPreview,
  getGenerateStatementsQaSummary,
  type QaLevel,
} from "@/features/statements/statements-qa.repo";
import { listPartiesMini } from "@/features/parties/parties.repo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
  searchParams?: Promise<{
    periodStart?: string;
    periodEnd?: string;
    partyId?: string;
    error?: string;
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

function normalizeDateInput(value: string | undefined) {
  if (!value) return "";
  return value;
}

export default async function GenerateStatementsPage({
  params,
  searchParams,
}: PageProps) {
  const { companySlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const selectedPeriodStart = normalizeDateInput(resolvedSearchParams.periodStart);
  const selectedPeriodEnd = normalizeDateInput(resolvedSearchParams.periodEnd);
  const selectedPartyId = resolvedSearchParams.partyId ?? "";
  const generateError = resolvedSearchParams.error ?? "";

  const supabase = await createClient();
  const { data: company, error: companyError } = await supabase
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

  const [qaSummary, preview, parties] = await Promise.all([
    getGenerateStatementsQaSummary(company.id),
    getGenerateStatementsPreview(company.id),
    listPartiesMini(company.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">
            <Link href={`/c/${companySlug}/statements`} className="underline">
              Statements
            </Link>{" "}
            / Generate
          </div>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Generate statements
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            Review the current candidate pool before generating statements.
            This view checks allocation-completed rows, groups them by party,
            and highlights anything that should block generation.
          </p>
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-sm font-medium ${badgeClass(
            qaSummary.level
          )}`}
        >
          {badgeLabel(qaSummary.level)}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6">
        {generateError ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {generateError}
          </div>
        ) : null}
        <form action={generateStatementsAction} className="space-y-4">
          <input type="hidden" name="companySlug" value={companySlug} />

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label
                htmlFor="periodStart"
                className="mb-1 block text-sm font-medium text-neutral-700"
              >
                Period start
              </label>
              <input
                id="periodStart"
                name="periodStart"
                type="date"
                defaultValue={selectedPeriodStart}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="periodEnd"
                className="mb-1 block text-sm font-medium text-neutral-700"
              >
                Period end
              </label>
              <input
                id="periodEnd"
                name="periodEnd"
                type="date"
                defaultValue={selectedPeriodEnd}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="partyId"
                className="mb-1 block text-sm font-medium text-neutral-700"
              >
                Party (optional)
              </label>
              <select
                id="partyId"
                name="partyId"
                defaultValue={selectedPartyId}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">All parties</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
              >
                Generate statements
              </button>
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            Current QA summary is based on allocation-completed rows available
            for statement generation.
          </p>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Candidate groups
          </div>
          <div className="mt-2 text-lg font-semibold">{qaSummary.candidateCount}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Total amount
          </div>
          <div className="mt-2 text-lg font-semibold">
            {formatMoney(qaSummary.totalAmount, qaSummary.currencies[0] ?? null)}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Currencies
          </div>
          <div className="mt-2 text-lg font-semibold">
            {qaSummary.currencies.length > 0 ? qaSummary.currencies.join(", ") : "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Rows missing work
          </div>
          <div className="mt-2 text-lg font-semibold">{qaSummary.rowsMissingWork}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Unmatched rows
          </div>
          <div className="mt-2 text-lg font-semibold">{qaSummary.unmatchedRows}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">QA issues</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Generation should not proceed when blockers are present.
            </p>
          </div>
        </div>

        {qaSummary.issues.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-600">
            No obvious issues detected.
          </div>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-neutral-700">
            {qaSummary.issues.map((issue) => (
              <li key={issue}>• {issue}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 text-sm font-medium">
          Candidate preview by party
        </div>

        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Party
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Currency
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Rows
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Works
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Total amount
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {preview.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  No candidate rows found.
                </td>
              </tr>
            ) : (
              preview.map((row) => (
                <tr key={`${row.party_id}-${row.currency ?? "none"}`}>
                  <td className="px-4 py-3">{row.party_name ?? row.party_id}</td>
                  <td className="px-4 py-3">{row.currency ?? "—"}</td>
                  <td className="px-4 py-3">{row.row_count}</td>
                  <td className="px-4 py-3">{row.works_count}</td>
                  <td className="px-4 py-3">
                    {formatMoney(row.total_amount, row.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}