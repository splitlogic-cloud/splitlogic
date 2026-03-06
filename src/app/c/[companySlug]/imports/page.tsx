import "server-only";
import Link from "next/link";
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

  const { data: imports, error } = await supabase
    .from("import_jobs")
    .select("id,status,created_at,processed_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`load imports failed: ${error.message}`);
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
          href={`/c/${companySlug}/masterdata/upload`}
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          New import
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_1fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Import ID</div>
          <div>Status</div>
          <div>Created</div>
          <div>Processed</div>
        </div>

        {!imports || imports.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            No imports yet.
          </div>
        ) : (
          imports.map((job) => (
            <div
              key={job.id}
              className="grid grid-cols-[1.2fr_0.8fr_0.8fr_1fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
            >
              <div className="truncate text-sm font-medium text-slate-900">
                {job.id}
              </div>
              <div className="text-sm text-slate-600">{job.status || "—"}</div>
              <div className="text-sm text-slate-600">
                {job.created_at
                  ? new Date(job.created_at).toISOString().slice(0, 10)
                  : "—"}
              </div>
              <div className="text-sm text-slate-600">
                {job.processed_at
                  ? new Date(job.processed_at).toISOString().slice(0, 10)
                  : "—"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}