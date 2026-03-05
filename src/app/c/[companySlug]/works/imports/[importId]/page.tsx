import "server-only";
import Link from "next/link";
import { requireActiveCompany } from "@/lib/active-company";
import { getImportJobById, listImportRows } from "@/features/imports/imports.repo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { companySlug: string; importId: string };
};

export default async function ImportDetailPage({ params }: PageProps) {
  const { companySlug, importId } = params;

  // membership + company context (even if repo functions don't need companyId)
  await requireActiveCompany(companySlug);

  // repo expects 1 arg (importId)
  const job = await getImportJobById(importId);

  if (!job) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold">Import not found</h1>
        <p className="text-sm text-slate-600">No import job with id {importId}.</p>
        <Link className="text-sm underline" href={`/c/${companySlug}/works/imports`}>
          Back to imports
        </Link>
      </div>
    );
  }

  const { rows } = await listImportRows(importId, 1, 50);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
          <div className="mt-1 text-sm text-slate-600">
            <div>
              <span className="font-medium">Status:</span> {job.status}
            </div>
            <div>
              <span className="font-medium">Created:</span>{" "}
              {job.created_at ? new Date(job.created_at).toLocaleString() : "-"}
            </div>
            <div className="truncate">
              <span className="font-medium">Job ID:</span> {job.id}
            </div>
          </div>
        </div>

        <Link
          href={`/c/${companySlug}/works/imports`}
          className="text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-white"
        >
          Back
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="text-sm font-medium">Rows</div>
          <div className="text-xs text-slate-500">Showing first 50</div>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">No rows.</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Row {r.row_number ?? "-"}</div>
                  {r.error ? (
                    <span className="text-xs px-2 py-1 rounded bg-rose-50 text-rose-700">
                      invalid
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700">
                      ok
                    </span>
                  )}
                </div>

                {r.error ? <div className="mt-2 text-sm text-rose-700">{r.error}</div> : null}

                <pre className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto">
                  {JSON.stringify(r.raw, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}