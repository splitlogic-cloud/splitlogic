import "server-only";
import { createClient } from "@/lib/supabase/server";
import StatementsListClient from "./StatementsListClient";

export const dynamic = "force-dynamic";

type StatementRow = {
  id: string;
  party_id: string | null;
  status: string | null;
  period_start: string | null;
  period_end: string | null;
  amount_basis: string | null;
  net_amount: number | null;
  gross_amount: number | null;
};

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

  const [{ data: statements, error: statementsError }, { data: parties, error: partiesError }] =
    await Promise.all([
      supabase
        .from("statements")
        .select(
          "id,party_id,status,period_start,period_end,amount_basis,net_amount,gross_amount"
        )
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("parties")
        .select("id,name,external_id")
        .eq("company_id", company.id),
    ]);

  if (statementsError) {
    throw new Error(`load statements failed: ${statementsError.message}`);
  }

  if (partiesError) {
    throw new Error(`load parties failed: ${partiesError.message}`);
  }

  const partyMap = new Map<string, PartyRow>();
  for (const party of (parties ?? []) as PartyRow[]) {
    partyMap.set(party.id, party);
  }

  const rows = ((statements ?? []) as StatementRow[]).map((statement) => {
    const party = statement.party_id ? partyMap.get(statement.party_id) : null;
    const partyName = party?.name || party?.external_id || "Unknown party";

    const amount =
      statement.amount_basis === "gross"
        ? statement.gross_amount
        : statement.net_amount;

    const periodLabel =
      statement.period_start && statement.period_end
        ? `${statement.period_start} → ${statement.period_end}`
        : "—";

    return {
      id: statement.id,
      partyName,
      periodLabel,
      amountLabel: typeof amount === "number" ? amount.toFixed(2) : "—",
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
        <div className="mb-2 text-lg font-semibold">Create statement</div>
        <p className="text-sm text-slate-500">
          Statement generation action is not wired in yet. Existing statements are shown below.
        </p>
      </div>

      <StatementsListClient companySlug={companySlug} rows={rows} />
    </div>
  );
}