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

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default async function ImportDetailPage({ params }: PageProps) {
  const { companySlug, importId } = await params;

  const company = await requireActiveCompany(companySlug);
  const job = await getImportJobById(company.companyId, importId);

  if (!job) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-xl font-semibold">Import not found</h1>
        <p className="text-sm text-slate-600">
          No import job with id {importId}.
        </p>
        <Link
          className="text-sm underline"
          href={`/c/${companySlug}/imports`}
        >
          Back to imports
        </Link>
      </div>
    );
  }

  const rows = await listImportRows(importId, 100);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Import detail
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Import job for company: {companySlug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/imports`}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-white"
        >
          Back to imports
        </Link>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid gap-4 p-4 md:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Import ID
            </div>
            <div className="mt-1 break-all text-sm font-medium text-slate-900">
              {job.id}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              File
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900">
              {job.filename ?? "-"}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Status
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900">
              {job.status ?? "-"}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Created
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900">
              {formatDate(job.created_at)}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-medium">Rows</div>
          <div className="text-xs text-slate-500">
            Showing first {rows.length} row{rows.length === 1 ? "" : "s"}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-4 text-sm text-slate-600">
            No import rows found.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const raw =
                row.raw && typeof row.raw === "object"
                  ? (row.raw as Record<string, unknown>)
                  : null;

              const rawRowIndex =
                typeof raw?.row_index === "number"
                  ? raw.row_index
                  : typeof raw?.row_index === "string"
                    ? raw.row_index
                    : index + 1;

              return (
                <div key={row.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">
                      Import row {String(rawRowIndex)}
                    </div>

                    <div className="text-xs text-slate-500">
                      {formatDate(row.created_at)}
                    </div>
                  </div>

                  <pre className="mt-3 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {JSON.stringify(raw ?? row, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}