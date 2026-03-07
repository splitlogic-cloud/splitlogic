import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditWorkPage({
  params,
}: {
  params: Promise<{ companySlug: string; workId: string }>;
}) {
  const { companySlug, workId } = await params;
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error("Company not found");
  }

  const { data: work, error: workError } = await supabase
    .from("works")
    .select("id, company_id, title, external_id, isrc, created_at, updated_at")
    .eq("id", workId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (workError) {
    throw new Error(`Failed to load work: ${workError.message}`);
  }

  if (!work) {
    throw new Error("Work not found");
  }

  async function updateWork(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const title = String(formData.get("title") || "").trim();
    const isrc = String(formData.get("isrc") || "").trim();

    if (!title) {
      throw new Error("Title is required");
    }

    const { error } = await supabase
      .from("works")
      .update({
        title,
        isrc: isrc || null,
      })
      .eq("id", work.id)
      .eq("company_id", company.id);

    if (error) {
      throw new Error(`Failed to update work: ${error.message}`);
    }

    redirect(`/c/${companySlug}/works/${work.id}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <a
          href={`/c/${companySlug}/works/${work.id}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to work
        </a>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit work</h1>
          <p className="text-sm text-slate-500">
            Update title and metadata for this catalog work.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              External ID
            </div>
            <div className="mt-1 break-all text-sm text-slate-900">
              {work.external_id || "—"}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Created
            </div>
            <div className="mt-1 text-sm text-slate-900">
              {work.created_at ? new Date(work.created_at).toLocaleString() : "—"}
            </div>
          </div>
        </div>
      </div>

      <form
        action={updateWork}
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
            defaultValue={work.title || ""}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="isrc" className="text-sm font-medium">
            ISRC
          </label>
          <input
            id="isrc"
            name="isrc"
            defaultValue={work.isrc || ""}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Save changes
          </button>

          <a
            href={`/c/${companySlug}/works/${work.id}`}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}