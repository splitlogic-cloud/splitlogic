import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import RunImportParseButton from "./RunImportParseButton";
import RunMatchingButton from "./RunMatchingButton";
import RunAllocationButton from "./RunAllocationButton";
import MatchReviewTable from "./MatchReviewTable";
import AllocationRunSummary from "./AllocationRunSummary";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
    importJobId: string;
  }>;
};

type CompanyRecord = {
  id: string;
  slug: string | null;
  name: string | null;
};

type ImportJobRecord = {
  id: string;
  company_id: string;
  file_name: string | null;
  file_path: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ImportRowRecord = {
  id: string;
  row_number: number | null;
  status: string | null;
  currency: string | null;
  net_amount: number | string | null;
  gross_amount: number | string | null;
  source_work_ref: string | null;
  matched_work_id: string | null;
  match_confidence: number | null;
  match_method: string | null;
  error_codes: string[] | null;
  canonical: Record<string, unknown> | null;
};

type RowStatusSummary = {
  pending: number;
  parsed: number;
  invalid: number;
  matched: number;
  needs_review: number;
  unmatched: number;
  allocated: number;
  total: number;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";

  const numeric =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));

  if (Number.isNaN(numeric)) {
    return String(value);
  }

  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function readCanonicalText(
  canonical: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = canonical?.[key];
  if (value === null || value === undefined) return "";
  return String(value);
}

function getRowStatusSummary(rows: ImportRowRecord[]): RowStatusSummary {
  const summary: RowStatusSummary = {
    pending: 0,
    parsed: 0,
    invalid: 0,
    matched: 0,
    needs_review: 0,
    unmatched: 0,
    allocated: 0,
    total: rows.length,
  };

  for (const row of rows) {
    const status = row.status ?? "pending";

    if (status === "pending") summary.pending += 1;
    else if (status === "parsed") summary.parsed += 1;
    else if (status === "invalid") summary.invalid += 1;
    else if (status === "matched") summary.matched += 1;
    else if (status === "needs_review") summary.needs_review += 1;
    else if (status === "unmatched") summary.unmatched += 1;
    else if (status === "allocated") summary.allocated += 1;
  }

  return summary;
}

function getPipelineStageLabel(status: string | null): string {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "parsing":
      return "Parsing";
    case "parsed":
      return "Parsed";
    case "matching":
      return "Matching";
    case "matched":
      return "Matched";
    case "match_review_required":
      return "Match review required";
    case "allocating":
      return "Allocating";
    case "allocated":
      return "Allocated";
    case "failed":
      return "Failed";
    default:
      return status ?? "Unknown";
  }
}

function getStatusBadgeClass(status: string | null): string {
  switch (status) {
    case "allocated":
    case "matched":
      return "border-green-200 bg-green-100 text-green-800";
    case "parsed":
    case "uploaded":
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "matching":
    case "parsing":
    case "allocating":
      return "border-amber-200 bg-amber-100 text-amber-800";
    case "match_review_required":
    case "needs_review":
    case "unmatched":
      return "border-orange-200 bg-orange-100 text-orange-800";
    case "invalid":
    case "failed":
      return "border-red-200 bg-red-100 text-red-800";
    default:
      return "border-gray-200 bg-gray-100 text-gray-800";
  }
}

function canRunParse(importJobStatus: string | null): boolean {
  return (
    importJobStatus === "uploaded" ||
    importJobStatus === "failed" ||
    importJobStatus === "parsing"
  );
}

function canRunMatching(importJobStatus: string | null, summary: RowStatusSummary): boolean {
  if (summary.total === 0) return false;

  if (
    summary.parsed === 0 &&
    summary.matched === 0 &&
    summary.needs_review === 0 &&
    summary.unmatched === 0
  ) {
    return false;
  }

  return (
    importJobStatus === "parsed" ||
    importJobStatus === "matching" ||
    importJobStatus === "match_review_required" ||
    importJobStatus === "failed"
  );
}

function isAllocationReady(summary: RowStatusSummary): boolean {
  return (
    summary.total > 0 &&
    summary.invalid === 0 &&
    summary.needs_review === 0 &&
    summary.unmatched === 0 &&
    (summary.matched > 0 || summary.allocated > 0)
  );
}

function buildBlockers(summary: RowStatusSummary, importJobStatus: string | null): string[] {
  const blockers: string[] = [];

  if (summary.total === 0) {
    blockers.push("Importjobbet har inga import_rows ännu.");
    return blockers;
  }

  if (importJobStatus === "uploaded") {
    blockers.push("Filen är uppladdad men inte parsad ännu.");
  }

  if (importJobStatus === "parsing") {
    blockers.push("Parsing pågår fortfarande.");
  }

  if (importJobStatus === "matching") {
    blockers.push("Matching pågår fortfarande.");
  }

  if (summary.invalid > 0) {
    blockers.push(`${summary.invalid} rader är invalid och måste rättas innan allocation.`);
  }

  if (summary.needs_review > 0) {
    blockers.push(`${summary.needs_review} rader kräver manuell match review.`);
  }

  if (summary.unmatched > 0) {
    blockers.push(`${summary.unmatched} rader är unmatched och måste matchas innan allocation.`);
  }

  if (
    summary.invalid === 0 &&
    summary.needs_review === 0 &&
    summary.unmatched === 0 &&
    summary.matched === 0 &&
    summary.allocated === 0
  ) {
    blockers.push("Det finns ännu inga matchade rader att allokera.");
  }

  return blockers;
}

async function getPageData(companySlug: string, importJobId: string) {
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, file_name, file_path, status, created_at, updated_at")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (importJobError) {
    throw new Error(`Failed to load import job: ${importJobError.message}`);
  }

  if (!importJob) {
    notFound();
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("import_rows")
    .select(`
      id,
      row_number,
      status,
      currency,
      net_amount,
      gross_amount,
      source_work_ref,
      matched_work_id,
      match_confidence,
      match_method,
      error_codes,
      canonical
    `)
    .eq("import_job_id", importJob.id)
    .order("row_number", { ascending: true });

  if (rowsError) {
    throw new Error(`Failed to load import rows: ${rowsError.message}`);
  }

  return {
    company: company as CompanyRecord,
    importJob: importJob as ImportJobRecord,
    rows: (rows ?? []) as ImportRowRecord[],
  };
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "green" | "orange" | "red" | "blue";
}) {
  const toneClass =
    tone === "green"
      ? "border-green-200 bg-green-50"
      : tone === "orange"
        ? "border-orange-200 bg-orange-50"
        : tone === "red"
          ? "border-red-200 bg-red-50"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50"
            : "border-gray-200 bg-white";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

export default async function ImportJobPage({ params }: Params) {
  const { companySlug, importJobId } = await params;
  const { company, importJob, rows } = await getPageData(companySlug, importJobId);

  const summary = getRowStatusSummary(rows);
  const allocationReady = isAllocationReady(summary);
  const blockers = buildBlockers(summary, importJob.status);
  const previewRows = rows.slice(0, 50);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/c/${companySlug}/imports`}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Till imports
            </Link>

            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadgeClass(importJob.status)}`}
            >
              {getPipelineStageLabel(importJob.status)}
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Import job
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {company.name ?? company.slug ?? company.id}
            </p>
          </div>

          <div className="grid gap-2 text-sm text-gray-600">
            <div>
              <span className="font-medium text-gray-900">File:</span>{" "}
              {importJob.file_name ?? "—"}
            </div>
            <div>
              <span className="font-medium text-gray-900">Created:</span>{" "}
              {formatDateTime(importJob.created_at)}
            </div>
            <div>
              <span className="font-medium text-gray-900">Updated:</span>{" "}
              {formatDateTime(importJob.updated_at)}
            </div>
            <div>
              <span className="font-medium text-gray-900">Import job ID:</span>{" "}
              {importJob.id}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {canRunParse(importJob.status) && (
            <RunImportParseButton
              companySlug={companySlug}
              importJobId={importJob.id}
            />
          )}

          {canRunMatching(importJob.status, summary) && (
            <RunMatchingButton
              companySlug={companySlug}
              importJobId={importJob.id}
            />
          )}

          {allocationReady ? (
            <RunAllocationButton
              companySlug={companySlug}
              importJobId={importJob.id}
            />
          ) : (
            <div className="inline-flex items-center rounded-md border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">
              Allocation blocked
            </div>
          )}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="Total rows" value={summary.total} tone="blue" />
        <MetricCard label="Parsed" value={summary.parsed} tone="blue" />
        <MetricCard label="Matched" value={summary.matched} tone="green" />
        <MetricCard
          label="Needs review"
          value={summary.needs_review}
          tone={summary.needs_review > 0 ? "orange" : "default"}
        />
        <MetricCard
          label="Unmatched"
          value={summary.unmatched}
          tone={summary.unmatched > 0 ? "orange" : "default"}
        />
        <MetricCard
          label="Invalid"
          value={summary.invalid}
          tone={summary.invalid > 0 ? "red" : "default"}
        />
        <MetricCard label="Allocated" value={summary.allocated} tone="green" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Pipeline status</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Current stage
              </div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                {getPipelineStageLabel(importJob.status)}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-900">
                Production rules before allocation
              </div>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li>• 0 invalid rows</li>
                <li>• 0 rows needing review</li>
                <li>• 0 unmatched rows</li>
                <li>• minst 1 matched row</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Blockers</h2>

          {blockers.length === 0 ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Inga blockers. Importjobbet är redo för allocation.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {blockers.map((blocker) => (
                <div
                  key={blocker}
                  className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900"
                >
                  {blocker}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <MatchReviewTable importJobId={importJob.id} />

      <AllocationRunSummary importJobId={importJob.id} />

      <section className="rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Import row preview</h2>
          <p className="mt-1 text-sm text-gray-600">
            Förhandsvisning av de första 50 raderna efter parse, matching och allocation.
          </p>
        </div>

        {previewRows.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-500">
            Inga import_rows finns ännu för detta jobb.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">Row</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Track</th>
                  <th className="px-4 py-3 font-medium">Artist</th>
                  <th className="px-4 py-3 font-medium">ISRC</th>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-4 py-3 font-medium">Net</th>
                  <th className="px-4 py-3 font-medium">Gross</th>
                  <th className="px-4 py-3 font-medium">Work ref</th>
                  <th className="px-4 py-3 font-medium">Matched work</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => {
                  const trackTitle = readCanonicalText(row.canonical, "track_title");
                  const artistName = readCanonicalText(row.canonical, "artist_name");
                  const isrc = readCanonicalText(row.canonical, "isrc");

                  return (
                    <tr key={row.id} className="border-b align-top">
                      <td className="px-4 py-3 text-gray-900">
                        {row.row_number ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(row.status)}`}
                        >
                          {row.status ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{trackTitle || "—"}</td>
                      <td className="px-4 py-3 text-gray-900">{artistName || "—"}</td>
                      <td className="px-4 py-3 text-gray-900">{isrc || "—"}</td>
                      <td className="px-4 py-3 text-gray-900">{row.currency ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {formatNumber(row.net_amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {formatNumber(row.gross_amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {row.source_work_ref ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {row.matched_work_id ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {row.match_confidence ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {row.match_method ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {row.error_codes && row.error_codes.length > 0
                          ? row.error_codes.join(", ")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Next action</h2>

        <div className="mt-4">
          {summary.total === 0 ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              Importjobbet saknar rows. Kör parse först.
            </div>
          ) : importJob.status === "uploaded" || importJob.status === "parsing" ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Nästa steg är att köra parse så att varje rad får canonical data och typed fields.
            </div>
          ) : summary.invalid > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              Nästa steg är att rätta invalid rows. Matching och allocation ska inte användas som workaround för trasig parse.
            </div>
          ) : summary.needs_review > 0 || summary.unmatched > 0 ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              Nästa steg är match review. Alla rader måste vara matchade innan allocation.
            </div>
          ) : allocationReady ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              Jobbet är redo för allocation.
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              Kontrollera status och counts innan du går vidare.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}