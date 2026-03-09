import "server-only";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; importJobId: string }>;
}) {
  const { companySlug, importJobId } = await params;

  if (!isUuid(importJobId)) {
    notFound();
  }

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

  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .select("id,file_name,status,created_at,processed_at")
    .eq("company_id", company.id)
    .eq("id", importJobId)
    .maybeSingle();

  if (jobError) {
    throw new Error(`load import job failed: ${jobError.message}`);
  }

  const { data: rows, error: rowsError } = await supabase
    .from("import_rows")
    .select("id,row_number,status,error,raw,created_at")
    .eq("import_id", importJobId)
    .order("row_number", { ascending: true })
    .limit(200);

  if (rowsError) {
    throw new Error(`load import rows failed: ${rowsError.message}`);
  }

  async function deleteImport() {
    "use server";

    const supabase = await createClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id,slug")
      .eq("slug", companySlug)
      .maybeSingle();

    if (companyError) {
      throw new Error(`load company failed: ${companyError.message}`);
    }

    if (!company) {
      throw new Error("Company not found");
    }

    const { error: deleteRowsError } = await supabase
      .from("import_rows")
      .delete()
      .eq("import_id", importJobId);

    if (deleteRowsError) {
      throw new Error(`delete import rows failed: ${deleteRowsError.message}`);
    }

    const { error: deleteJobError } = await supabase
      .from("import_jobs")
      .delete()
      .eq("company_id", company.id)
      .eq("id", importJobId);

    if (deleteJobError) {
      throw new Error(`delete import failed: ${deleteJobError.message}`);
    }

    revalidatePath(`/c/${companySlug}/imports`);
    redirect(`/c/${companySlug}/imports`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Import detail</h1>
          <p className="text-sm text-slate-500">
            Import job for company: {company.name || company.slug}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <form action={deleteImport}>
            <button
              type="submit"
              className="inline-flex rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50"
            >
              Delete import
            </button>
          </form>

          <Link
            href={`/c/${companySlug}/imports`}
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to imports
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {job ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <div className="text-sm text-slate-500">Import ID</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.id}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">File</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.file_name || "—"}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">Status</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.status || "—"}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">Created</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.created_at
                  ? new Date(job.created_at)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")
                  : "—"}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Import job not found.</p>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[90px_110px_1fr_1.6fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Row</div>
          <div>Status</div>
          <div>Error</div>
          <div>Raw</div>
        </div>

        {!rows || rows.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            No import rows found.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[90px_110px_1fr_1.6fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
            >
              <div className="text-sm text-slate-900">{row.row_number ?? "—"}</div>
              <div className="text-sm text-slate-600">{row.status || "—"}</div>
              <div className="text-sm text-slate-600">{row.error || "—"}</div>
              <div className="truncate text-sm text-slate-500">
                {row.raw ? JSON.stringify(row.raw) : "—"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}