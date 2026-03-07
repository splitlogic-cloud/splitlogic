// src/app/c/[companySlug]/parties/new/page.tsx
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const ALLOWED_PARTY_TYPES = [
  "artist",
  "producer",
  "writer",
  "label",
  "publisher",
  "manager",
  "other",
] as const;

export default async function NewPartyPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  async function createParty(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const type = String(formData.get("type") || "").trim().toLowerCase();
    const externalId = String(formData.get("external_id") || "").trim();

    if (!name) {
      throw new Error("Name is required");
    }

    if (!ALLOWED_PARTY_TYPES.includes(type as (typeof ALLOWED_PARTY_TYPES)[number])) {
      throw new Error(`Invalid party type: ${type}`);
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, slug")
      .eq("slug", companySlug)
      .maybeSingle();

    if (companyError) {
      throw new Error(`Failed to load company: ${companyError.message}`);
    }

    if (!company) {
      throw new Error("Company not found");
    }

    const { error } = await supabase.from("parties").insert({
      company_id: company.id,
      name,
      email: email || null,
      type,
      external_id: externalId || null,
    });

    if (error) {
      throw new Error(`Failed to create party: ${error.message}`);
    }

    redirect(`/c/${companySlug}/parties`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New party</h1>
        <p className="text-sm text-slate-500">
          Create a new rights holder or recipient
        </p>
      </div>

      <form
        action={createParty}
        className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Artist / Label / Writer"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="type" className="text-sm font-medium">
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue="artist"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="artist">Artist</option>
            <option value="producer">Producer</option>
            <option value="writer">Writer</option>
            <option value="label">Label</option>
            <option value="publisher">Publisher</option>
            <option value="manager">Manager</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="external_id" className="text-sm font-medium">
            External ID
          </label>
          <input
            id="external_id"
            name="external_id"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create party
          </button>

          <a
            href={`/c/${companySlug}/parties`}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}