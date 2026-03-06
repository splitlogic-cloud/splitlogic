import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StatementsListClient from "./StatementsListClient";
import { listStatementsByCompany, generateStatement } from "@/features/statements/statements.repo";

export const dynamic = "force-dynamic";

type PartyRow = {
  id: string;
  name: string | null;
  external_id: string | null;
};

export default async function StatementsPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`load company failed: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

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

    await generateStatement({
      companyId: company.id,
      periodStart,
      periodEnd,
      amountField,
    });

    redirect(`/c/${companySlug}/statements`);
  }

  const [{ data: parties, error: partiesError }, statements] = await Promise.all([
    supabase
      .from("parties")
      .select("id,name,external_id")
      .eq("company_id", company.id),
    listStatementsByCompany(company.id, { limit: 200 }),
  ]);

  if (partiesError) {
    throw new Error(`load parties failed: ${partiesError.message}`);
  }

  const partyMap = new Map<string, PartyRow>();
  for (const party of (parties ?? []) as PartyRow[]) {
    partyMap.set(party.id, party);
  }

  const rows = statements.map((statement) => {
    const party = statement.party_id ? partyMap.get(statement.party_id) : null;
    const partyName = party?.name || party?.external_id || "Unknown party";

    const periodLabel =
      statement.period_start && statement.period_end
        ? `${statement.period_start} → ${statement.period_end}`
        : "—";

    return {
      id: statement.id,
      partyName,
      periodLabel,
      amountLabel: "—",
      status: statement.status || "draft",
    };
  });

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

      <StatementsListClient companySlug={companySlug} rows={rows} />
    </div>
  );
}