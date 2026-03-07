// src/app/c/[companySlug]/works/new/page.tsx
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function NewWorkPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  async function createWork(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const title = String(formData.get("title") || "").trim();
    const isrc = String(formData.get("isrc") || "").trim();

    if (!title) {
      throw new Error("Title is required");
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

    const { error } = await supabase.from("works").insert({
      company_id: company.id,
      title,
      isrc: isrc || null,
    });

    if (error) {
      throw new Error(`Failed to create work: ${error.message}`);
    }

    redirect(`/c/${companySlug}/works`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New work</h1>
        <p className="text-sm text-slate-500">
          Create a new catalog work for {companySlug}
        </p>
      </div>

      <form
        action={createWork}
        className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-1">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Song title"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="isrc" className="text-sm font-medium">
            ISRC
          </label>
          <input
            id="isrc"
            name="isrc"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create work
          </button>

          <a
            href={`/c/${companySlug}/works`}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}