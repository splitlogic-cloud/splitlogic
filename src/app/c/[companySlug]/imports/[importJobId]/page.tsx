import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ManualMatchCell from "./ManualMatchCell";
import ClearMatchButton from "./ClearMatchButton";
import RunMatchingV3Button from "./RunMatchingV3Button";
import RunAllocationButton from "./RunAllocationButton";
import BootstrapWorksButton from "./BootstrapWorksButton";
import {
  getLatestAllocationRunForImport,
  listAllocationBlockersForImport,
  listAllocationTotalsByParty,
  type AllocationBlockerRow,
} from "@/features/allocations/allocations.repo";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
    importJobId: string;
  }>;
};

type RawRecord = Record<string, unknown>;

type CompanyRecord = {
  id: string;
  slug: string | null;
  name: string | null;
};

type ImportJobRecord = {
  id: string;
  company_id: string;
  file_name: string | null;
  created_at: string | null;
};

type ImportRowRecord = {
  id: string;
  row_number: number | null;
  raw: unknown;
  created_at: string | null;
  matched_work_id: string | null;
  match_source: string | null;
  match_confidence: number | string | null;
};

type WorkOption = {
  id: string;
  title: string | null;
  isrc: string | null;
};

function asRecord(value: unknown): RawRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as RawRecord;
}

function pickString(raw: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}

function pickNumberLike(raw: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getRowView(rawValue: unknown) {
  const raw = asRecord(rawValue);

  return {
    title: pickString(raw, ["title", "track", "track_title", "product"]),
    artist: pickString(raw, [
      "artist",
      "track_artist",
      "product_artist",
      "main_artist",
    ]),
    isrc: pickString(raw, ["isrc", "ISRC"]),
    store: pickString(raw, ["store", "service", "service_detail"]),
    country: pickString(raw, ["country", "sale_country", "territory"]),
    revenue: pickNumberLike(raw, [
      "net_share_account_currency",
      "netShareAccountCurrency",
      "netAccountAmount",
      "net_account_amount",
      "amount",
      "revenue",
      "earnings",
    ]),
    currency: pickString(raw, [
      "account_currency",
      "accountCurrency",
      "currency",
      "sale_currency",
    ]),
    period: pickString(raw, [
      "statement_period",
      "period",
      "month",
      "reporting_period",
    ]),
  };
}

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      {hint ? <div className="mt-1 text-sm text-slate-500">{hint}</div> : null}
    </div>
  );
}

function statusBadgeClass(status: string | null) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (status === "running") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }
  if (status === "failed") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function blockerBadge(blocker: AllocationBlockerRow) {
  if (blocker.status === "missing_splits") {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
        Missing splits
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
      Invalid split total
    </span>
  );
}

function StepLink({
  href,
  label,
  sublabel,
}: {
  href: string;
  label: string;
  sublabel: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50"
    >
      <div className="text-sm font-medium text-slate-900">{label}</div>
      <div className="mt-1 text-sm text-slate-500">{sublabel}</div>
    </Link>
  );
}

export default async function ImportReviewPage({ params }: Params) {
  const { companySlug, importJobId } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`load company failed: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const typedCompany = company as CompanyRecord;

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, file_name, created_at")
    .eq("id", importJobId)
    .eq("company_id", typedCompany.id)
    .maybeSingle();

  if (importJobError) {
    throw new Error(`load import job failed: ${importJobError.message}`);
  }

  if (!importJob) {
    notFound();
  }

  const typedImportJob = importJob as ImportJobRecord;

  const [
    totalRowsResult,
    matchedRowsResult,
    unmatchedRowsResult,
    isrcExactResult,
    titleArtistExactResult,
    fuzzyResult,
    manualResult,
    otherSourceResult,
    unmatchedPreviewResult,
    workOptionsResult,
    latestAllocationRun,
    blockers,
  ] = await Promise.all([
    supabaseAdmin
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", typedImportJob.id),

    supabaseAdmin
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", typedImportJob.id)
      .not("matched_work_id", "is", null),

    supabaseAdmin
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", typedImportJob.id)
      .is("matched_work_id", null),

    supabaseAdmin
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", typedImportJob.id)
      .eq("match_source", "isrc_exact"),

    supabaseAdmin
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", typedImportJob.id)
      .eq("match_source", "title_artist_exact"),

    supabaseAdmin
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", typedImportJob.id)
      .eq("match_source", "fuzzy"),

    supabaseAdmin
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", typedImportJob.id)
      .eq("match_source", "manual"),

    supabaseAdmin
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_id", typedImportJob.id)
      .not(
        "match_source",
        "in",
        '("isrc_exact","title_artist_exact","fuzzy","manual")'
      ),

    supabaseAdmin
      .from("import_rows")
      .select(
        "id, row_number, raw, created_at, matched_work_id, match_source, match_confidence"
      )
      .eq("import_id", typedImportJob.id)
      .is("matched_work_id", null)
      .order("row_number", { ascending: true })
      .limit(200),

      supabaseAdmin
      .from("works")
      .select("id, title, artist, isrc")
      .eq("company_id", typedCompany.id)
      .order("title", { ascending: true })
      .limit(2000),

    getLatestAllocationRunForImport({
      companyId: typedCompany.id,
      importId: typedImportJob.id,
    }),

    listAllocationBlockersForImport({
      companyId: typedCompany.id,
      importId: typedImportJob.id,
    }),
  ]);

  const totalRows = totalRowsResult.count ?? 0;
  const matchedRows = matchedRowsResult.count ?? 0;
  const unmatchedRows = unmatchedRowsResult.count ?? 0;
  const matchPercent = totalRows > 0 ? (matchedRows / totalRows) * 100 : 0;

  const isrcExact = isrcExactResult.count ?? 0;
  const titleArtistExact = titleArtistExactResult.count ?? 0;
  const fuzzy = fuzzyResult.count ?? 0;
  const manual = manualResult.count ?? 0;
  const otherSource = otherSourceResult.count ?? 0;

  const unmatchedPreview = (unmatchedPreviewResult.data ?? []) as ImportRowRecord[];
  const workOptions = (workOptionsResult.data ?? []) as WorkOption[];

  const partyTotals = latestAllocationRun
    ? await listAllocationTotalsByParty({
        allocationRunId: latestAllocationRun.id,
      })
    : [];

  const missingBlockers = blockers.filter((b) => b.status === "missing_splits");
  const invalidBlockers = blockers.filter(
    (b) => b.status === "invalid_split_total"
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-sm text-slate-500">
            Imports / {typedImportJob.id}
          </div>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
            Import review
          </h1>
          <div className="mt-2 text-sm text-slate-600">
            {typedCompany.name ?? typedCompany.slug ?? "Company"} ·{" "}
            {typedImportJob.file_name ?? "Unnamed file"} ·{" "}
            {formatDate(typedImportJob.created_at)}
          </div>
        </div>

        <div className="flex w-full max-w-xl flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <BootstrapWorksButton
              companyId={typedCompany.id}
              companySlug={companySlug}
              importJobId={typedImportJob.id}
            />

            <RunMatchingV3Button
              companySlug={companySlug}
              importJobId={typedImportJob.id}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-900">Current goal</div>
            <div className="mt-1 text-sm text-slate-600">
              Bootstrap missing works, run matching, fix split blockers, then
              allocate and generate statements.
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total rows" value={totalRows} />
        <StatCard title="Matched rows" value={matchedRows} />
        <StatCard title="Unmatched rows" value={unmatchedRows} />
        <StatCard title="Match %" value={formatPercent(matchPercent)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="ISRC exact" value={isrcExact} />
        <StatCard title="Title/artist exact" value={titleArtistExact} />
        <StatCard title="Fuzzy" value={fuzzy} />
        <StatCard title="Manual" value={manual} />
        <StatCard title="Other source" value={otherSource} />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            Next steps
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Use this import as the control center for the whole workflow.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StepLink
            href={`/c/${companySlug}/works`}
            label="Open works"
            sublabel="Review works and prepare split setup."
          />
          <StepLink
            href={`/c/${companySlug}/statements`}
            label="Open statements"
            sublabel="Review generated statements and exports."
          />
          <StepLink
            href={`/c/${companySlug}/audit`}
            label="Open audit"
            sublabel="Verify system events and traceability."
          />
          {latestAllocationRun ? (
            <StepLink
              href={`/c/${companySlug}/allocations/${latestAllocationRun.id}`}
              label="Open allocation QA"
              sublabel="Inspect latest allocation run for this import."
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              Run allocation first to unlock direct QA access for this import.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Allocation engine
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Allocate matched rows to parties using work splits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {latestAllocationRun ? (
              <Link
                href={`/c/${companySlug}/allocations/${latestAllocationRun.id}`}
                className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                View QA
              </Link>
            ) : null}

            <RunAllocationButton
              companySlug={companySlug}
              importJobId={typedImportJob.id}
            />
          </div>
        </div>

        {latestAllocationRun ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Status
                </div>
                <div className="mt-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${statusBadgeClass(
                      latestAllocationRun.status
                    )}`}
                  >
                    {latestAllocationRun.status}
                  </span>
                </div>
              </div>

              <StatCard
                title="Total input rows"
                value={latestAllocationRun.total_input_rows}
              />
              <StatCard
                title="Eligible rows"
                value={latestAllocationRun.eligible_rows}
              />
              <StatCard
                title="Allocation rows"
                value={latestAllocationRun.allocated_rows}
              />
              <StatCard
                title="Skipped unmatched"
                value={latestAllocationRun.skipped_unmatched_rows}
              />
              <StatCard
                title="Skipped bad/missing splits"
                value={
                  latestAllocationRun.skipped_missing_splits_rows +
                  latestAllocationRun.skipped_invalid_split_rows
                }
              />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
                Party totals
              </div>

              {partyTotals.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Party</th>
                        <th className="px-4 py-3 font-medium">Allocated amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partyTotals.map((party) => (
                        <tr
                          key={party.partyId}
                          className="border-t border-slate-100 text-slate-800"
                        >
                          <td className="px-4 py-3">{party.partyName}</td>
                          <td className="px-4 py-3">
                            {party.allocatedAmount.toFixed(6)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-4 py-5 text-sm text-slate-500">
                  No allocation rows yet.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No allocation run yet for this import.
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Allocation blockers
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Works that block allocation because they have missing or invalid
              splits.
            </p>
          </div>

          <Link
            href={`/c/${companySlug}/works`}
            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Open works
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Blocked works" value={blockers.length} />
          <StatCard title="Missing splits" value={missingBlockers.length} />
          <StatCard title="Invalid split total" value={invalidBlockers.length} />
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200">
          {blockers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Work</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Blocked rows</th>
                    <th className="px-4 py-3 font-medium">Split rows</th>
                    <th className="px-4 py-3 font-medium">Split total</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {blockers.map((blocker) => (
                    <tr
                      key={blocker.workId}
                      className="border-t border-slate-100 align-top text-slate-800"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {blocker.workTitle}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Work ID: {blocker.workId}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          ISRC: {blocker.workIsrc || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">{blockerBadge(blocker)}</td>
                      <td className="px-4 py-3 font-medium">
                        {blocker.blockedRows}
                      </td>
                      <td className="px-4 py-3">{blocker.splitCount}</td>
                      <td className="px-4 py-3">
                        {blocker.splitTotal.toFixed(6)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/c/${companySlug}/works/${blocker.workId}/splits`}
                          className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                        >
                          Fix splits
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-5 text-sm text-emerald-700">
              No allocation blockers found. All matched works have valid splits.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            Unmatched rows
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            First 200 unmatched rows for this import. Manual matches update
            coverage directly.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Row</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Artist</th>
                <th className="px-4 py-3 font-medium">ISRC</th>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Revenue</th>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {unmatchedPreview.length > 0 ? (
                unmatchedPreview.map((row) => {
                  const view = getRowView(row.raw);

                  return (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 align-top text-slate-800"
                    >
                      <td className="px-4 py-3">{row.row_number ?? "—"}</td>
                      <td className="px-4 py-3">{view.title || "—"}</td>
                      <td className="px-4 py-3">{view.artist || "—"}</td>
                      <td className="px-4 py-3">{view.isrc || "—"}</td>
                      <td className="px-4 py-3">{view.store || "—"}</td>
                      <td className="px-4 py-3">{view.country || "—"}</td>
                      <td className="px-4 py-3">
                        {view.revenue
                          ? `${view.revenue} ${view.currency || ""}`.trim()
                          : `— ${view.currency || ""}`.trim()}
                      </td>
                      <td className="px-4 py-3">{view.period || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <ManualMatchCell
                            companySlug={companySlug}
                            importJobId={typedImportJob.id}
                            rowId={row.id}
                            matchedWorkId={row.matched_work_id}
                            works={workOptions.map((work) => ({
                              id: work.id,
                              title: work.title ?? "Untitled",
                              artist: work.artist ?? null,
                              isrc: work.isrc ?? null,
                            }))}
                          />
                          {row.matched_work_id ? (
                            <ClearMatchButton rowId={row.id} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={9}>
                    No unmatched rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}