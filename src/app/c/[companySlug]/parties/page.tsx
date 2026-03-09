import "server-only";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PartiesPage({
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

  const { data: parties, error } = await supabase
    .from("parties")
    .select("id,name,email,type,external_id,created_at,updated_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`load parties failed: ${error.message}`);
  }

  async function deleteParty(formData: FormData) {
    "use server";

    const partyId = String(formData.get("partyId") || "");
    if (!partyId) return;

    const supabase = await createClient();

    const { data: company } = await supabase
      .from("companies")
      .select("id,slug")
      .eq("slug", companySlug)
      .maybeSingle();

    if (!company) {
      throw new Error("Company not found");
    }

    const { error } = await supabase
      .from("parties")
      .delete()
      .eq("company_id", company.id)
      .eq("id", partyId);

    if (error) {
      throw new Error(`delete party failed: ${error.message}`);
    }

    revalidatePath(`/c/${companySlug}/parties`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Parties</h1>
          <p className="text-sm text-slate-500">
            Rights holders and recipients for company: {company.name || company.slug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/parties/new`}
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
        >
          Add party
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.2fr_1fr_0.9fr_1.2fr_220px] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Name</div>
          <div>Email</div>
          <div>Type</div>
          <div>External ID</div>
          <div>Actions</div>
        </div>

        {!parties || parties.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">No parties found.</div>
        ) : (
          parties.map((party) => (
            <div
              key={party.id}
              className="grid grid-cols-[1.2fr_1fr_0.9fr_1.2fr_220px] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/c/${companySlug}/parties/${party.id}/edit`}
                  className="text-sm font-medium text-slate-900 hover:text-slate-700 hover:underline"
                >
                  {party.name || "—"}
                </Link>
              </div>

              <div className="min-w-0 text-sm text-slate-600">
                {party.email || "—"}
              </div>

              <div className="min-w-0 text-sm text-slate-600">
                {party.type || "—"}
              </div>

              <div className="min-w-0 break-all text-sm text-slate-500">
                {party.external_id || "—"}
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/c/${companySlug}/parties/${party.id}/edit`}
                  className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </Link>

                <form action={deleteParty}>
                  <input type="hidden" name="partyId" value={party.id} />
                  <button
                    type="submit"
                    className="inline-flex rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}