import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CompanyRecord = {
  id: string;
  name: string | null;
  slug: string | null;
};

type ImportJobRecord = {
  id: string;
  file_name: string | null;
  filename?: string | null;
  status: string | null;
  created_at: string | null;
  processed_at: string | null;
};

function getImportJobStatusLabel(status: string | null) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "failed" || normalized === "error") {
    return "uploaded";
  }
  return status || "—";
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function statusBadgeClass(status: string | null) {
  const normalized = (status ?? "").toLowerCase();

  if (normalized === "parsed" || normalized === "completed" || normalized === "done") {
    return "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700";
  }

  if (normalized === "processing" || normalized === "running") {
    return "inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700";
  }

  if (normalized === "failed" || normalized === "error") {
    return "inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700";
  }

  return "inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700";
}

export default async function ImportsPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,name,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`load company failed: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const typedCompany = company as CompanyRecord;

  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from("import_jobs")
    .select("id,file_name,filename,status,created_at,processed_at")
    .eq("company_id", typedCompany.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (jobsError) {
    throw new Error(`load import jobs failed: ${jobsError.message}`);
  }

  const typedJobs = (jobs ?? []) as ImportJobRecord[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Imports</h1>
          <p className="text-sm text-slate-500">
            Import jobs for company: {typedCompany.name || typedCompany.slug}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/c/${companySlug}/works/import`}
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Import works
          </Link>

          <Link
            href={`/c/${companySlug}/imports/upload`}
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Upload file
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.8fr_140px_190px_190px_170px] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>File</div>
          <div>Status</div>
          <div>Created</div>
          <div>Processed</div>
          <div>Actions</div>
        </div>

        {typedJobs.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">No imports found.</div>
        ) : (
          typedJobs.map((job) => {
            const displayFileName = job.file_name || job.filename || job.id;

            return (
              <div
                key={job.id}
                className="grid grid-cols-[1.8fr_140px_190px_190px_170px] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
              >
                <Link
                  href={`/c/${companySlug}/imports/${job.id}`}
                  className="min-w-0 text-sm font-medium text-slate-900 hover:text-slate-700 hover:underline"
                  title={displayFileName}
                >
                  <span className="block truncate">{displayFileName}</span>
                </Link>

                <div className="text-sm text-slate-600">
                  <span className={statusBadgeClass(job.status)}>
                    {getImportJobStatusLabel(job.status)}
                  </span>
                </div>

                <div className="text-sm text-slate-600">
                  {formatDateTime(job.created_at)}
                </div>

                <div className="text-sm text-slate-600">
                  {formatDateTime(job.processed_at)}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/c/${companySlug}/imports/${job.id}`}
                    className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Open
                  </Link>

                  <form
                    method="POST"
                    action={`/c/${companySlug}/imports/${job.id}/delete`}
                  >
                    <button
                      type="submit"
                      className="inline-flex rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}