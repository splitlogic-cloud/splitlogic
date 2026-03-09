import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ImportsPage({
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

  const { data: jobs, error: jobsError } = await supabase
    .from("import_jobs")
    .select("id,file_name,status,created_at,processed_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (jobsError) {
    throw new Error(`load import jobs failed: ${jobsError.message}`);
  }

  async function deleteImport(formData: FormData) {
    "use server";

    const importId = String(formData.get("importId") || "").trim();
    const companySlugFromForm = String(formData.get("companySlug") || "").trim();

    if (!importId) {
      throw new Error("Missing importId");
    }

    if (!companySlugFromForm) {
      throw new Error("Missing companySlug");
    }

    const supabase = await createClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id,slug")
      .eq("slug", companySlugFromForm)
      .maybeSingle();

    if (companyError) {
      throw new Error(`load company failed: ${companyError.message}`);
    }

    if (!company) {
      throw new Error("Company not found");
    }

    const { error: rowsDeleteError } = await supabase
      .from("import_rows")
      .delete()
      .eq("import_id", importId);

    if (rowsDeleteError) {
      throw new Error(`delete import rows failed: ${rowsDeleteError.message}`);
    }

    const { error: jobDeleteError } = await supabase
      .from("import_jobs")
      .delete()
      .eq("company_id", company.id)
      .eq("id", importId);

    if (jobDeleteError) {
      throw new Error(`delete import failed: ${jobDeleteError.message}`);
    }

    redirect(`/c/${companySlugFromForm}/imports`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Imports</h1>
          <p className="text-sm text-slate-500">
            Import jobs for company: {company.name || company.slug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/imports/upload`}
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
        >
          Upload file
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.8fr_140px_190px_190px_140px] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>File</div>
          <div>Status</div>
          <div>Created</div>
          <div>Processed</div>
          <div>Actions</div>
        </div>

        {!jobs || jobs.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            No imports found.
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className="grid grid-cols-[1.8fr_140px_190px_190px_140px] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
            >
              <Link
                href={`/c/${companySlug}/imports/${job.id}`}
                className="text-sm font-medium text-slate-900 hover:text-slate-700 hover:underline"
              >
                {job.file_name || job.id}
              </Link>

              <div className="text-sm text-slate-600">{job.status || "—"}</div>

              <div className="text-sm text-slate-600">
                {job.created_at
                  ? new Date(job.created_at)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")
                  : "—"}
              </div>

              <div className="text-sm text-slate-600">
                {job.processed_at
                  ? new Date(job.processed_at)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")
                  : "—"}
              </div>

              <form action={deleteImport}>
                <input type="hidden" name="importId" value={job.id} />
                <input type="hidden" name="companySlug" value={companySlug} />
                <button
                  type="submit"
                  className="inline-flex rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}