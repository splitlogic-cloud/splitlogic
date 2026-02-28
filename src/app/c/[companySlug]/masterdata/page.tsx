import { revalidatePath } from "next/cache";
import Link from "next/link";

import UploadMasterdataClient from "./UploadMasterdataClient";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import {
  listMasterdataImportJobs,
  listImportRows,
  applyMasterdataImport,
  undoMasterdataImport,
} from "@/features/imports/imports.repo";

type AnyParams = Record<string, string | string[] | undefined>;

type PageProps = {
  // Next 16 kan skicka Promise här i vissa render-paths
  params: AnyParams | Promise<AnyParams>;
  searchParams?: AnyParams | Promise<AnyParams>;
};

function safeJson(v: any) {
  try {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function pickSlug(params: AnyParams): string | null {
  const candidates = ["companySlug", "slug", "company", "company_id", "companyId", "tenant", "tenantSlug"];

  for (const key of candidates) {
    const v = params?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
  }

  const keys = Object.keys(params || {});
  if (keys.length === 1) {
    const only = params[keys[0]];
    if (typeof only === "string" && only.trim()) return only.trim();
    if (Array.isArray(only) && typeof only[0] === "string" && only[0].trim()) return only[0].trim();
  }

  return null;
}

function toInt(v: any, fallback: number) {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function badgeClass(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (["applied", "done", "completed", "success"].includes(s)) return "bg-emerald-100 text-emerald-900";
  if (["reverted", "undone"].includes(s)) return "bg-slate-100 text-slate-900";
  if (["failed", "error"].includes(s)) return "bg-rose-100 text-rose-900";
  if (["processing", "running"].includes(s)) return "bg-amber-100 text-amber-900";
  return "bg-blue-100 text-blue-900";
}

export default async function MasterdataPage(props: PageProps) {
  // ✅ Next 16 robust: await params/searchParams
  const params = (await props.params) as AnyParams;
  const searchParams = (props.searchParams ? await props.searchParams : {}) as AnyParams;

  // DEBUG (kan tas bort sen)
  console.log("MASTERDATA ROUTE DEBUG", { params, searchParams });

  const companySlug = pickSlug(params);
  const page = Math.max(1, toInt(searchParams?.page, 1));
  const pageSize = Math.min(200, Math.max(10, toInt(searchParams?.pageSize, 50)));

  if (!companySlug) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Masterdata</h1>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="font-semibold text-rose-900">Missing company slug param</div>
          <p className="mt-1 text-sm text-rose-800">
            Route-param hittades inte. Här är props som Next skickar.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="text-sm font-semibold">Debug</div>
          <div className="mt-2 text-sm text-slate-600">params:</div>
          <pre className="mt-1 text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-auto">
            {safeJson(params)}
          </pre>

          <div className="mt-3 text-sm text-slate-600">searchParams:</div>
          <pre className="mt-1 text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-auto">
            {safeJson(searchParams)}
          </pre>
        </div>
      </div>
    );
  }

  const company = await requireCompanyBySlugForUser(companySlug);

  async function applyAction(formData: FormData) {
    "use server";
    const importJobId = String(formData.get("import_job_id") || "");
    if (!importJobId) throw new Error("Missing import_job_id");
    await applyMasterdataImport(importJobId);
    revalidatePath(`/c/${companySlug}/masterdata`);
  }

  async function undoAction(formData: FormData) {
    "use server";
    const importJobId = String(formData.get("import_job_id") || "");
    if (!importJobId) throw new Error("Missing import_job_id");
    await undoMasterdataImport(importJobId);
    revalidatePath(`/c/${companySlug}/masterdata`);
  }

  const jobs = await listMasterdataImportJobs(company.id, 10);
  const latestJob = jobs?.[0] ?? null;

  const rowsResult: any =
    latestJob?.id ? await listImportRows(latestJob.id, page, pageSize) : { rows: [], hasNext: false };

  const previewRows: any[] = Array.isArray(rowsResult?.rows) ? rowsResult.rows : [];
  const hasPrev = page > 1;
  const hasNext = typeof rowsResult?.hasNext === "boolean" ? rowsResult.hasNext : previewRows.length >= pageSize;

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Masterdata</h1>
          <div className="text-sm text-slate-600">
            Company: <span className="font-medium text-slate-900">{company.name}</span>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Ladda upp template → preview → <span className="font-medium">Apply</span> → <span className="font-medium">Undo</span>.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Upload</h2>
        <p className="text-sm text-slate-600">
          POST: <code className="px-1 py-0.5 bg-slate-100 rounded">/c/{companySlug}/masterdata/upload</code>
        </p>
        <div className="mt-4">
          <UploadMasterdataClient companySlug={companySlug} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Senaste import-jobb</h2>

        {!latestJob ? (
          <p className="mt-2 text-sm text-slate-600">Inga jobb ännu.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600">Job ID</div>
                <div className="font-mono text-xs">{latestJob.id}</div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600">Status</div>
                <span className={`text-xs px-2 py-1 rounded-full ${badgeClass(latestJob.status)}`}>
                  {latestJob.status ?? "unknown"}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600">Created</div>
                <div className="text-sm text-slate-900">
                  {latestJob.created_at ? new Date(latestJob.created_at).toLocaleString("sv-SE") : "-"}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600">Counts</div>
                <div className="text-sm text-slate-900">
                  ok: {latestJob.ok_count ?? 0} · invalid: {latestJob.invalid_count ?? 0} · total: {latestJob.total_count ?? 0}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 space-y-3">
              <div>
                <div className="text-sm text-slate-600">Warnings</div>
                <pre className="mt-1 text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-32">
                  {safeJson(latestJob.warnings)}
                </pre>
              </div>

              <div className="flex gap-2">
                <form action={applyAction}>
                  <input type="hidden" name="import_job_id" value={latestJob.id} />
                  <button className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm hover:opacity-90">
                    Apply
                  </button>
                </form>

                <form action={undoAction}>
                  <input type="hidden" name="import_job_id" value={latestJob.id} />
                  <button className="px-3 py-2 rounded-xl border border-slate-300 text-sm hover:bg-slate-50">
                    Undo
                  </button>
                </form>
              </div>

              <p className="text-xs text-slate-600">Efter Apply/Undo refreshas sidan automatiskt.</p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Preview rows</h2>

          {latestJob?.id ? (
            <div className="flex items-center gap-2 text-sm">
              <Link
                className={`px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 ${
                  hasPrev ? "" : "pointer-events-none opacity-40"
                }`}
                href={`/c/${companySlug}/masterdata?page=${page - 1}&pageSize=${pageSize}`}
              >
                Prev
              </Link>
              <span className="text-slate-600">
                page {page} · pageSize {pageSize}
              </span>
              <Link
                className={`px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 ${
                  hasNext ? "" : "pointer-events-none opacity-40"
                }`}
                href={`/c/${companySlug}/masterdata?page=${page + 1}&pageSize=${pageSize}`}
              >
                Next
              </Link>
            </div>
          ) : null}
        </div>

        {!latestJob?.id ? (
          <p className="mt-2 text-sm text-slate-600">Ingen preview än.</p>
        ) : (
          <div className="mt-3 overflow-auto border border-slate-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-slate-200">#</th>
                  <th className="text-left px-3 py-2 border-b border-slate-200">Status</th>
                  <th className="text-left px-3 py-2 border-b border-slate-200">Error</th>
                  <th className="text-left px-3 py-2 border-b border-slate-200">Raw</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r: any, idx: number) => (
                  <tr key={r.id ?? idx} className="odd:bg-white even:bg-slate-50">
                    <td className="px-3 py-2 align-top border-b border-slate-100 font-mono text-xs">
                      {r.row_number ?? idx + 1 + (page - 1) * pageSize}
                    </td>
                    <td className="px-3 py-2 align-top border-b border-slate-100">
                      <span className={`text-xs px-2 py-1 rounded-full ${badgeClass(r.status ?? (r.error ? "invalid" : "ok"))}`}>
                        {r.status ?? (r.error ? "invalid" : "ok")}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top border-b border-slate-100 text-rose-700">
                      {r.error ? String(r.error) : ""}
                    </td>
                    <td className="px-3 py-2 align-top border-b border-slate-100">
                      <pre className="text-xs whitespace-pre-wrap break-words max-w-[900px]">
                        {safeJson(r.raw ?? r.data ?? r.payload)}
                      </pre>
                    </td>
                  </tr>
                ))}

                {previewRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-600" colSpan={4}>
                      Inga rows hittades.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}