import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateStatementsAction } from "./actions";
import {
  getGenerateStatementsPreview,
  getGenerateStatementsQaSummary,
  type QaLevel,
} from "@/features/statements/statements-qa.repo";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
  }>;
  searchParams?: Promise<{
    periodStart?: string;
    periodEnd?: string;
  }>;
};

type AllocationSummary = {
  min_earning_date: string | null;
  max_earning_date: string | null;
  row_count: number;
  party_count: number;
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

async function getAllocationLedgerSummary(companyId: string): Promise<AllocationSummary> {
  const { data, error } = await supabaseAdmin
    .from("allocation_rows")
    .select("earning_date,party_id")
    .eq("company_id", companyId)
    .not("party_id", "is", null);

  if (error) {
    throw new Error(`Failed to load allocation ledger summary: ${error.message}`);
  }

  const rows = data ?? [];

  const dates = rows
    .map((row: any) => (typeof row.earning_date === "string" ? row.earning_date : null))
    .filter(Boolean) as string[];

  const partyIds = new Set<string>();
  for (const row of rows) {
    if (row.party_id) partyIds.add(row.party_id);
  }

  dates.sort();

  return {
    min_earning_date: dates[0] ?? null,
    max_earning_date: dates[dates.length - 1] ?? null,
    row_count: rows.length,
    party_count: partyIds.size,
  };
}

export default async function GenerateStatementsPage({
  params,
  searchParams,
}: Params) {
  const { companySlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
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

  const summary = await getAllocationLedgerSummary(company.id);

  const selectedPeriodStart =
    resolvedSearchParams?.periodStart ?? summary.min_earning_date ?? "";
  const selectedPeriodEnd =
    resolvedSearchParams?.periodEnd ?? summary.max_earning_date ?? "";

  const qaSummary =
    selectedPeriodStart && selectedPeriodEnd
      ? await getGenerateStatementsQaSummary(company.id, selectedPeriodStart, selectedPeriodEnd)
      : null;

  const preview =
    selectedPeriodStart && selectedPeriodEnd
      ? await getGenerateStatementsPreview(company.id, selectedPeriodStart, selectedPeriodEnd)
      : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">
            <Link href={`/c/${companySlug}/statements`} className="underline">
              Statements
            </Link>{" "}
            / Generate
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Generate statements
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Generate draft statements from allocation ledger rows in a selected period.
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/statements`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
        >
          Back to statements
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Earliest earning date
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.min_earning_date ?? "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Latest earning date
          </div>
          <div className="mt-2 text-lg font-semibold">
            {summary.max_earning_date ?? "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Allocation rows
          </div>
          <div className="mt-2 text-lg font-semibold">{summary.row_count}</div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Parties in ledger
          </div>
          <div className="mt-2 text-lg font-semibold">{summary.party_count}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold">How it works</h2>
        <div className="mt-3 space-y-2 text-sm text-neutral-700">
          <p>
            Statements are generated from <strong>allocation_rows</strong> within a selected period.
          </p>
          <p>
            You can run allocation monthly for visibility, but still generate half-year statements from the full period.
          </p>
          <p>
            Best practice: <strong>many allocation runs, one ledger, statements by period</strong>.
          </p>
        </div>
      </div>

      <form
        method="get"
        action={`/c/${companySlug}/statements/generate`}
        className="rounded-2xl border bg-white p-6"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">Preview period start</label>
            <input
              type="date"
              name="periodStart"
              defaultValue={selectedPeriodStart}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Preview period end</label>
            <input
              type="date"
              name="periodEnd"
              defaultValue={selectedPeriodEnd}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Refresh QA preview
          </button>
        </div>
      </form>

      {qaSummary ? (
        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">QA Summary</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Pre-flight check before you generate statements.
              </p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-sm font-medium ${badgeClass(qaSummary.level)}`}>
              {badgeLabel(qaSummary.level)}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Rows in period</div>
              <div className="mt-2 text-lg font-semibold">{qaSummary.rowsInPeriod}</div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Missing party</div>
              <div className="mt-2 text-lg font-semibold">{qaSummary.rowsMissingParty}</div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Missing work</div>
              <div className="mt-2 text-lg font-semibold">{qaSummary.rowsMissingWork}</div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Missing earning date</div>
              <div className="mt-2 text-lg font-semibold">{qaSummary.rowsMissingEarningDate}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Party coverage</div>
              <div className="mt-2 text-lg font-semibold">
                {qaSummary.partyCoveragePct.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Work coverage</div>
              <div className="mt-2 text-lg font-semibold">
                {qaSummary.workCoveragePct.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Currencies</div>
              <div className="mt-2 text-lg font-semibold">
                {qaSummary.currencies.length > 0 ? qaSummary.currencies.join(", ") : "—"}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Ledger total</div>
              <div className="mt-2 text-lg font-semibold">
                {formatMoney(qaSummary.totalAllocated, null)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">Issues</div>
            {qaSummary.issues.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-600">No obvious issues detected.</div>
            ) : (
              <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                {qaSummary.issues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Statement preview</h2>
            <p className="mt-1 text-sm text-neutral-600">
              This shows what will likely become one draft statement per party.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Party</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Rows</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Works</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Total</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">QA</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {preview.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    No preview rows for this period.
                  </td>
                </tr>
              ) : (
                preview.slice(0, 100).map((row) => (
                  <tr key={row.partyId}>
                    <td className="px-4 py-3">{row.partyName}</td>
                    <td className="px-4 py-3">{row.rowCount}</td>
                    <td className="px-4 py-3">{row.workCount}</td>
                    <td className="px-4 py-3">{formatMoney(row.totalAmount, row.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(row.level)}`}>
                        {badgeLabel(row.level)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {row.issues.length > 0 ? row.issues.join(" ") : "No obvious issues."}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form
        action={generateStatementsAction}
        className="rounded-2xl border bg-white p-6"
      >
        <input type="hidden" name="companySlug" value={company.slug ?? companySlug} />
        <input type="hidden" name="periodStart" value={selectedPeriodStart} />
        <input type="hidden" name="periodEnd" value={selectedPeriodEnd} />

        <div>
          <label className="mb-2 block text-sm font-medium">Optional note</label>
          <textarea
            name="note"
            rows={4}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Optional internal note for this statement batch"
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Generate draft statements
          </button>

          <Link
            href={`/c/${companySlug}/statements`}
            className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}