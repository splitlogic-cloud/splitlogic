import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditPartyPage({
  params,
}: {
  params: Promise<{ companySlug: string; partyId: string }>;
}) {
  const { companySlug, partyId } = await params;
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

  const { data: party, error: partyError } = await supabase
    .from("parties")
    .select("id,name,email,type,external_id")
    .eq("company_id", company.id)
    .eq("id", partyId)
    .maybeSingle();

  if (partyError) {
    throw new Error(`load party failed: ${partyError.message}`);
  }

  if (!party) {
    throw new Error(`Party not found for id: ${partyId}`);
  }

  async function updateParty(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const emailRaw = String(formData.get("email") || "").trim();
    const typeRaw = String(formData.get("type") || "").trim();
    const externalIdRaw = String(formData.get("external_id") || "").trim();

    if (!name) {
      throw new Error("Name is required");
    }

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
      .update({
        name,
        email: emailRaw || null,
        type: typeRaw || null,
        external_id: externalIdRaw || null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", company.id)
      .eq("id", partyId);

    if (error) {
      throw new Error(`update party failed: ${error.message}`);
    }

    revalidatePath(`/c/${companySlug}/parties`);
    revalidatePath(`/c/${companySlug}/parties/${partyId}/edit`);
    redirect(`/c/${companySlug}/parties`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit party</h1>
          <p className="text-sm text-slate-500">
            Update rights holder / recipient for company: {company.name || company.slug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/parties`}
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to parties
        </Link>
      </div>

      <form
        action={updateParty}
        className="max-w-3xl space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={party.name || ""}
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={party.email || ""}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="type"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Type
            </label>
            <input
              id="type"
              name="type"
              type="text"
              defaultValue={party.type || ""}
              placeholder="artist, producer, songwriter..."
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="external_id"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              External ID
            </label>
            <input
              id="external_id"
              name="external_id"
              type="text"
              defaultValue={party.external_id || ""}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Save changes
          </button>

          <Link
            href={`/c/${companySlug}/parties`}
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}