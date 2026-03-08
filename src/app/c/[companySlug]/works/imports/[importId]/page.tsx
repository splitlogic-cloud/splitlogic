import "server-only";

import Link from "next/link";
import { requireActiveCompany } from "@/lib/active-company";
import { getImportJobById, listImportRows } from "@/features/imports/imports.repo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
    importId: string;
  }>;
};

export default async function ImportDetailPage({ params }: PageProps) {
  const { companySlug, importId } = await params;

  const company = await requireActiveCompany(companySlug);
  const job = await getImportJobById(company.companyId, importId);

  if (!job) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-xl font-semibold">Import not found</h1>
        <p className="text-sm text-slate-600">No import job with id {importId}.</p>
        <Link className="text-sm underline" href={`/c/${companySlug}/works/imports`}>
          Back to imports
        </Link>
      </div>
    );
  }

  const rows = await listImportRows(importId, 50);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
          <div className="mt-1 space-y-1 text-sm text-slate-600">
            <div>
              <span className="font-medium">Status:</span> {String(job.status ?? "-")}
            </div>
            <div>
              <span className="font-medium">Created:</span>{" "}
              {job.created_at ? new Date(job.created_at).toLocaleString() : "-"}
            </div>
            <div className="truncate">
              <span className="font-medium">Job ID:</span> {String(job.id)}
            </div>
          </div>
        </div>

        <Link
          href={`/c/${companySlug}/works/imports`}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-white"
        >
          Back
        </Link>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-medium">Rows</div>
          <div className="text-xs text-slate-500">Showing first 50</div>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">No rows.</div>
          ) : (
            rows.map((r, index) => (
              <div key={String(r.id ?? index)} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Import row {index + 1}</div>
                </div>

                <pre className="mt-3 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                  {JSON.stringify(r, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}