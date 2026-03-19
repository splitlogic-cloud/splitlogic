import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateStatementsAction } from "./actions";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
  }>;
};

type AllocationSummary = {
  min_earning_date: string | null;
  max_earning_date: string | null;
  row_count: number;
  party_count: number;
  total_amount: number;
};

function asNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

async function getAllocationLedgerSummary(
  companyId: string,
): Promise<AllocationSummary> {
  const { data, error } = await supabaseAdmin
    .from("allocation_rows")
    .select("earning_date,party_id,allocated_amount")
    .eq("company_id", companyId)
    .not("party_id", "is", null);

  if (error) {
    throw new Error(`Failed to load allocation ledger summary: ${error.message}`);
  }

  const rows = data ?? [];

  const dates = rows
    .map((row: any) =>
      typeof row.earning_date === "string" ? row.earning_date : null,
    )
    .filter(Boolean) as string[];

  const partyIds = new Set<string>();
  let totalAmount = 0;

  for (const row of rows) {
    if (row.party_id) {
      partyIds.add(row.party_id);
    }
    totalAmount += asNumber(row.allocated_amount);
  }

  dates.sort();

  return {
    min_earning_date: dates[0] ?? null,
    max_earning_date: dates[dates.length - 1] ?? null,
    row_count: rows.length,
    party_count: partyIds.size,
    total_amount: totalAmount,
  };
}

export default async function GenerateStatementsPage({ params }: Params) {
  const { companySlug } = await params;

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
            Statements are generated from <strong>allocation_rows</strong> within a
            selected period.
          </p>
          <p>
            This means you can run allocation monthly for visibility, but still
            generate half-year statements from the full ledger period.
          </p>
          <p>
            Recommended model: <strong>many allocation runs, one ledger, statements by period</strong>.
          </p>
        </div>
      </div>

      <form
        action={generateStatementsAction}
        className="rounded-2xl border bg-white p-6"
      >
        <input
          type="hidden"
          name="companySlug"
          value={company.slug ?? companySlug}
        />

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">Period start</label>
            <input
              type="date"
              name="periodStart"
              defaultValue={summary.min_earning_date ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            <p className="mt-2 text-xs text-neutral-500">
              Example: 2025-07-01 for H2 start.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Period end</label>
            <input
              type="date"
              name="periodEnd"
              defaultValue={summary.max_earning_date ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            <p className="mt-2 text-xs text-neutral-500">
              Example: 2025-12-31 for H2 end.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium">
            Optional note
          </label>
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