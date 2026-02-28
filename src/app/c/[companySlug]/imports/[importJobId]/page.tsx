import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import {
  getImportJobAdmin,
  listImportRowsByJobAdmin,
} from "@/features/imports/imports.repo";

export const dynamic = "force-dynamic";

function fmt(dt: string | null | undefined) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return "—";
  }
}

export default async function ImportJobDetailPage(props: {
  params:
    | Promise<{ companySlug: string; importJobId: string }>
    | { companySlug: string; importJobId: string };
  searchParams?: Promise<{ page?: string }> | { page?: string };
}) {
  const params =
    props.params instanceof Promise ? await props.params : props.params;
  const searchParams =
    props.searchParams instanceof Promise
      ? await props.searchParams
      : props.searchParams;

  const companySlug = params.companySlug;
  const importJobId = params.importJobId;

  // 1) Access + company
  const { company } = await requireCompanyBySlugForUser(companySlug);
  if (!company?.id) notFound();

  // 2) Job (if not found for this company -> 404)
  const job = await getImportJobAdmin({ companyId: company.id, importJobId }).catch(
    () => notFound()
  );

  // 3) Pagination
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  // 4) Invalid rows (error IS NOT NULL)
  const invalidRows = await listImportRowsByJobAdmin({
    companyId: company.id,
    importJobId,
    onlyInvalid: true,
    limit,
    offset,
  });

  const summaryEntries = Object.entries(job.error_summary ?? {}).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            className="text-sm underline text-muted-foreground"
            href={`/c/${companySlug}/imports`}
          >
            ← Back to imports
          </Link>

          <h1 className="text-xl font-semibold">Import detail</h1>

          <div className="text-sm text-muted-foreground">
            {job.file_name ?? "—"} • {job.provider ?? "—"}
          </div>

          <div className="text-xs text-muted-foreground">Job ID: {job.id}</div>
        </div>

        <div className="rounded-md border px-3 py-2 text-sm">
          <div>
            <span className="font-medium">Status:</span> {job.status}
          </div>
          <div>
            <span className="font-medium">Created:</span> {fmt(job.created_at)}
          </div>
          <div>
            <span className="font-medium">Processed:</span>{" "}
            {fmt(job.processed_at)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Company: {company.name} ({company.slug})
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-3">
          <div className="text-sm text-muted-foreground">Rows total</div>
          <div className="text-2xl font-semibold">{job.rows_total}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-sm text-muted-foreground">Valid</div>
          <div className="text-2xl font-semibold">{job.rows_valid}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-sm text-muted-foreground">Invalid</div>
          <div className="text-2xl font-semibold">{job.rows_invalid}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-3">
          <div className="font-medium">Error breakdown</div>
          <div className="text-sm text-muted-foreground">
            Top errors in this import.
          </div>

          <div className="mt-3 space-y-1 text-sm">
            {summaryEntries.length === 0 ? (
              <div className="text-muted-foreground">No errors 🎉</div>
            ) : (
              summaryEntries.slice(0, 20).map(([code, count]) => (
                <div key={code} className="flex items-center justify-between">
                  <span className="font-mono">{code}</span>
                  <span className="tabular-nums">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="font-medium">Last error</div>
          <div className="mt-2 text-sm whitespace-pre-wrap break-words">
            {job.last_error ?? "—"}
          </div>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <div className="font-medium">Invalid rows</div>
            <div className="text-sm text-muted-foreground">
              Showing {limit} per page.
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <a
              className="rounded-md border px-2 py-1"
              href={`/c/${companySlug}/imports/${importJobId}/invalid`}
            >
              Download invalid CSV
            </a>

            <div className="flex items-center gap-2">
              <Link
                className="rounded-md border px-2 py-1"
                href={`/c/${companySlug}/imports/${importJobId}?page=${Math.max(
                  1,
                  page - 1
                )}`}
              >
                Prev
              </Link>
              <span className="text-muted-foreground">Page {page}</span>
              <Link
                className="rounded-md border px-2 py-1"
                href={`/c/${companySlug}/imports/${importJobId}?page=${page + 1}`}
              >
                Next
              </Link>
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Row</th>
              <th className="p-3">Error</th>
              <th className="p-3">Warnings</th>
            </tr>
          </thead>

          <tbody>
            {invalidRows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3 font-mono">{r.row_number ?? "—"}</td>
                <td className="p-3 whitespace-pre-wrap break-words">
                  {r.error ? JSON.stringify(r.error) : "—"}
                </td>
                <td className="p-3 whitespace-pre-wrap break-words">
                  {r.warnings ? JSON.stringify(r.warnings) : "—"}
                </td>
              </tr>
            ))}

            {invalidRows.length === 0 && (
              <tr>
                <td className="p-6 text-muted-foreground" colSpan={3}>
                  No invalid rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}