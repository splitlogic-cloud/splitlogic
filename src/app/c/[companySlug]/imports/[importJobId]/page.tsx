import "server-only";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; importJobId: string }>;
}) {
  const { companySlug, importJobId } = await params;
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
    .select("id,status,created_at,processed_at")
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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Import detail</h1>
          <p className="text-sm text-slate-500">
            Import job for company: {company.name || company.slug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/imports`}
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to imports
        </Link>
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
              <div className="text-sm text-slate-500">Status</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.status || "—"}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">Created</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.created_at
                  ? new Date(job.created_at).toISOString().slice(0, 19).replace("T", " ")
                  : "—"}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">Processed</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.processed_at
                  ? new Date(job.processed_at).toISOString().slice(0, 19).replace("T", " ")
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