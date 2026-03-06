import "server-only";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PartiesPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const { data: parties, error } = await supabase
    .from("parties")
    .select("id,name,email,type,external_id,created_at,updated_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`load parties failed: ${error.message}`);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

        <div className="grid grid-cols-[1.4fr_1.1fr_0.9fr_1fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Name</div>
          <div>Email</div>
          <div>Type</div>
          <div>External ID</div>
        </div>

        {!parties || parties.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-sm text-slate-500">
            <div>No parties yet.</div>

            <Link
              href={`/c/${companySlug}/parties/new`}
              className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Create first party
            </Link>
          </div>
        ) : (
          parties.map((party) => (
            <div
              key={party.id}
              className="grid grid-cols-[1.4fr_1.1fr_0.9fr_1fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
            >
              <div className="font-medium text-slate-900">
                {party.name || "Unknown party"}
              </div>

              <div className="text-sm text-slate-600">
                {party.email || "—"}
              </div>

              <div className="text-sm text-slate-600">
                {party.type || "—"}
              </div>

              <div className="text-sm text-slate-600">
                {party.external_id || "—"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}