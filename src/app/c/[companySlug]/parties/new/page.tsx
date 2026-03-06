import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function NewPartyPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  async function createParty(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const name = String(formData.get("name") || "");
    const email = String(formData.get("email") || "");
    const type = String(formData.get("type") || "");
    const externalId = String(formData.get("external_id") || "");

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("slug", companySlug)
      .maybeSingle();

    if (!company) throw new Error("Company not found");

    const { error } = await supabase.from("parties").insert({
      company_id: company.id,
      name,
      email,
      type,
      external_id: externalId,
    });

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/c/${companySlug}/parties`);
  }

  return (
    <div className="space-y-6 max-w-xl">

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New party</h1>
        <p className="text-sm text-slate-500">
          Create a new rights holder or recipient
        </p>
      </div>

      <form action={createParty} className="space-y-4 rounded-3xl border bg-white p-6 shadow-sm">

        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <input
            name="name"
            required
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Type</label>
          <input
            name="type"
            placeholder="artist / label / publisher"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">External ID</label>
          <input
            name="external_id"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create party
          </button>

          <a
            href={`/c/${companySlug}/parties`}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}