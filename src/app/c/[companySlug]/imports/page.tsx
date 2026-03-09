import "server-only";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PartyListRow = {
  id: string;
  name: string | null;
  email: string | null;
  type: string | null;
  external_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function PartiesPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const { data: parties, error: partiesError } = await supabase
    .from("parties")
    .select("id, name, email, type, external_id, created_at, updated_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (partiesError) {
    throw new Error(`Failed to load parties: ${partiesError.message}`);
  }

  const rows = ((parties ?? []) as PartyListRow[]).map((party) => ({
    ...party,
    name: party.name?.trim() || "Unknown party",
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Parties</h1>
          <p className="text-sm text-slate-500">
            Rights holders and recipients for company: {companySlug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/parties/new`}
          className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add party
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.4fr_1.1fr_0.9fr_1fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Name</div>
          <div>Email</div>
          <div>Type</div>
          <div>External ID</div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-sm text-slate-500">
            <div>No parties yet.</div>

            <Link
              href={`/c/${companySlug}/parties/new`}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Create first party
            </Link>
          </div>
        ) : (
          rows.map((party) => (
            <div
              key={party.id}
              className="grid grid-cols-[1.4fr_1.1fr_0.9fr_1fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
            >
              <div>
                <Link
                  href={`/c/${companySlug}/parties/${party.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {party.name}
                </Link>
              </div>

              <div className="text-sm text-slate-600">
                {party.email || "—"}
              </div>

              <div className="text-sm text-slate-600">
                {party.type || "—"}
              </div>

              <div className="break-all text-sm text-slate-600">
                {party.external_id || "—"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}