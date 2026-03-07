// src/app/c/[companySlug]/statements/page.tsx
import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import StatementsListClient from "./StatementsListClient";
import {
  listStatementsByCompany,
  generateStatement,
} from "@/features/statements/statements.repo";

export const dynamic = "force-dynamic";

type PartyRow = {
  id: string;
  name: string | null;
  external_id: string | null;
};

function fmtPeriod(periodStart: string | null, periodEnd: string | null) {
  if (!periodStart || !periodEnd) return "—";
  return `${periodStart} → ${periodEnd}`;
}

function fmtAmount(amount: number | null | undefined, currency = "SEK") {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `${currency} ${new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
  }).format(safe)}`;
}

export default async function StatementsPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  const supabase = await createSupabaseServerClient();
  const company = await requireCompanyBySlugForUser(companySlug);

  async function createStatement(formData: FormData) {
    "use server";

    const periodStart = String(formData.get("period_start") || "").trim();
    const periodEnd = String(formData.get("period_end") || "").trim();
    const amountFieldRaw = String(formData.get("amount_field") || "net").trim();

    const amountField = amountFieldRaw === "gross" ? "gross" : "net";

    if (!periodStart) {
      throw new Error("Period start is required");
    }

    if (!periodEnd) {
      throw new Error("Period end is required");
    }

    const result = await generateStatement({
      companyId: company.id,
      periodStart,
      periodEnd,
      amountField,
    });

    const statementId =
      result && typeof result === "object" && "id" in result ? result.id : null;

    if (!statementId || typeof statementId !== "string") {
      throw new Error(
        "Statement was generated, but no statement id was returned from generateStatement()."
      );
    }

    redirect(`/c/${companySlug}/statements/${statementId}`);
  }

  const [{ data: parties, error: partiesError }, statements] = await Promise.all([
    supabase
      .from("parties")
      .select("id,name,external_id")
      .eq("company_id", company.id)
      .order("name", { ascending: true }),
    listStatementsByCompany(company.id, { limit: 200 }),
  ]);

  if (partiesError) {
    throw new Error(`load parties failed: ${partiesError.message}`);
  }

  const partyMap = new Map<string, PartyRow>();
  for (const party of (parties ?? []) as PartyRow[]) {
    partyMap.set(party.id, party);
  }

  const rows = statements.map((statement: any) => {
    const party = statement.party_id ? partyMap.get(statement.party_id) : null;
    const partyName = party?.name || party?.external_id || "Unknown party";

    return {
      id: statement.id,
      partyName,
      periodLabel: fmtPeriod(statement.period_start, statement.period_end),
      amountLabel: fmtAmount(
        statement.total_payable_amount ??
          statement.total_amount ??
          statement.payable_amount ??
          0,
        statement.currency ?? "SEK"
      ),
      status: statement.status || "draft",
      href: `/c/${companySlug}/statements/${statement.id}`,
      createdAt: statement.created_at ?? null,
    };
  });

  const hasStatements = rows.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Statements</h1>
        <p className="text-sm text-slate-500">
          Generate, review and export statements.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <div className="text-lg font-semibold">Create statement</div>
          <p className="text-sm text-slate-500">
            Generate statements for a selected period.
          </p>
        </div>

        <form action={createStatement} className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Period start</label>
            <input
              type="date"
              name="period_start"
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Period end</label>
            <input
              type="date"
              name="period_end"
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Amount basis</label>
            <select
              name="amount_field"
              defaultValue="net"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="net">Net</option>
              <option value="gross">Gross</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Create statement
            </button>
          </div>
        </form>
      </div>

      {hasStatements ? (
        <StatementsListClient companySlug={companySlug} rows={rows} />
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 shadow-sm">
          <div className="max-w-xl">
            <div className="text-lg font-semibold text-slate-900">
              No statements yet
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Statements appear here after you generate them for a selected
              period. Once created, you can review details, inspect line items
              and export CSV.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Use the form above to create your first statement
              </a>

              <Link
                href={`/c/${companySlug}/masterdata`}
                className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Go to masterdata
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}