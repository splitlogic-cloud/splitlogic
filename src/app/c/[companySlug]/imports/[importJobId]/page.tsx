import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import BootstrapWorksButton from "./BootstrapWorksButton";
import ManualMatchCell from "./ManualMatchCell";
import ClearMatchButton from "./ClearMatchButton";
import RunMatchingV3Button from "./RunMatchingV3Button";
import RunAllocationButton from "./RunAllocationButton";
import {
  getLatestAllocationRunForImport,
  listAllocationTotalsByParty,
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
  matched_work_id: string | null;
  match_source: string | null;
  match_confidence: number | string | null;
  created_at: string | null;
};

type WorkRecord = {
  id: string;
  title: string | null;
  artist: string | null;
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
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function pickNumberLike(raw: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number") return String(value);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sv-SE");
}

function getRowView(rawValue: unknown) {
  const raw = asRecord(rawValue);

  return {
    title: pickString(raw, [
      "title",
      "track",
      "track_title",
      "song_title",
      "work_title",
      "release_title",
      "product",
    ]),
    artist: pickString(raw, [
      "artist",
      "track_artist",
      "artist_name",
      "main_artist",
      "product_artist",
    ]),
    isrc: pickString(raw, ["isrc", "track_isrc"]),
    store: pickString(raw, ["store", "service", "provider", "retailer"]),
    country: pickString(raw, ["country", "sale_country", "territory"]),
    netRevenue: pickNumberLike(raw, [
      "net_revenue",
      "net_amount",
      "netAccountAmount",
      "amount",
      "net_receipts",
      "royalty_amount",
    ]),
    currency: pickString(raw, [
      "currency",
      "account_currency",
      "sale_currency",
      "accountCurrency",
    ]),
    period: pickString(raw, [
      "period",
      "statement_period",
      "month",
      "reporting_period",
    ]),
  };
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-zinc-900">{value}</div>
      {sublabel ? <div className="mt-1 text-sm text-zinc-500">{sublabel}</div> : null}
    </div>
  );
}

export default async function ImportReviewPage({ params }: Params) {
  const { companySlug, importJobId } = await params;

  if (
    !importJobId ||
    importJobId.includes("[") ||
    importJobId.includes("]") ||
    importJobId === "undefined"
  ) {
    throw new Error(`Invalid importJobId in route: ${importJobId}`);
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle<CompanyRecord>();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const { data: importJob, error: importError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, file_name, created_at")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle<ImportJobRecord>();

  if (importError) {
    throw new Error(`Failed to load import job: ${importError.message}`);
  }

  if (!importJob) {
    notFound();
  }

  const [
    totalRowsResult,
    matchedRowsResult,
    unmatchedRowsResult,
    sourceCountsResult,
    unmatchedRowsResultList,
    recentMatchedRowsResult,
    worksResult,
    latestAllocationRun,
  ] = await Promise.all([
    supabaseAdmin
      .from("import_rows")
      .select("*", { count: "exact", head: true })
      .eq("import_id", importJob.id),

    supabaseAdmin
      .from("import_rows")
      .select("*", { count: "exact", head: true })
      .eq("import_id", importJob.id)
      .not("matched_work_id", "is", null),

    supabaseAdmin
      .from("import_rows")
      .select("*", { count: "exact", head: true })
      .eq("import_id", importJob.id)
      .is("matched_work_id", null),

    supabaseAdmin
      .from("import_rows")
      .select("match_source")
      .eq("import_id", importJob.id)
      .not("matched_work_id", "is", null),

    supabaseAdmin
      .from("import_rows")
      .select(
        "id, row_number, raw, matched_work_id, match_source, match_confidence, created_at"
      )
      .eq("import_id", importJob.id)
      .is("matched_work_id", null)
      .order("row_number", { ascending: true })
      .limit(200),

    supabaseAdmin
      .from("import_rows")
      .select(
        "id, row_number, raw, matched_work_id, match_source, match_confidence, created_at"
      )
      .eq("import_id", importJob.id)
      .not("matched_work_id", "is", null)
      .order("row_number", { ascending: true })
      .limit(50),

    supabaseAdmin
      .from("works")
      .select("id, title, artist, isrc")
      .eq("company_id", company.id)
      .order("title", { ascending: true })
      .limit(1000),

    getLatestAllocationRunForImport({
      companyId: company.id,
      importId: importJob.id,
    }),
  ]);

  if (totalRowsResult.error) {
    throw new Error(`Failed to load total rows: ${totalRowsResult.error.message}`);
  }

  if (matchedRowsResult.error) {
    throw new Error(`Failed to load matched rows: ${matchedRowsResult.error.message}`);
  }

  if (unmatchedRowsResult.error) {
    throw new Error(
      `Failed to load unmatched rows: ${unmatchedRowsResult.error.message}`
    );
  }

  if (sourceCountsResult.error) {
    throw new Error(`Failed to load match sources: ${sourceCountsResult.error.message}`);
  }

  if (unmatchedRowsResultList.error) {
    throw new Error(
      `Failed to load unmatched row list: ${unmatchedRowsResultList.error.message}`
    );
  }

  if (recentMatchedRowsResult.error) {
    throw new Error(
      `Failed to load recent matched row list: ${recentMatchedRowsResult.error.message}`
    );
  }

  if (worksResult.error) {
    throw new Error(`Failed to load works: ${worksResult.error.message}`);
  }

  const totalRows = totalRowsResult.count ?? 0;
  const matchedRows = matchedRowsResult.count ?? 0;
  const unmatchedRows = unmatchedRowsResult.count ?? 0;
  const matchPct = totalRows > 0 ? (matchedRows / totalRows) * 100 : 0;

  const sourceCounts = {
    isrc_exact: 0,
    title_artist_exact: 0,
    fuzzy: 0,
    manual: 0,
    other: 0,
  };

  for (const row of sourceCountsResult.data ?? []) {
    const source = row.match_source;
    if (source === "isrc_exact") sourceCounts.isrc_exact += 1;
    else if (source === "title_artist_exact") sourceCounts.title_artist_exact += 1;
    else if (source === "fuzzy") sourceCounts.fuzzy += 1;
    else if (source === "manual") sourceCounts.manual += 1;
    else sourceCounts.other += 1;
  }

  const unmatchedRowsList = (unmatchedRowsResultList.data ?? []) as ImportRowRecord[];
  const recentMatchedRows = (recentMatchedRowsResult.data ?? []) as ImportRowRecord[];
  const works = (worksResult.data ?? []) as WorkRecord[];

  const allocationPartyTotals = latestAllocationRun
    ? await listAllocationTotalsByParty({
        allocationRunId: latestAllocationRun.id,
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-sm text-zinc-500">
            <Link
              href={`/c/${companySlug}/imports`}
              className="hover:text-zinc-900 hover:underline"
            >
              Imports
            </Link>{" "}
            / <span className="text-zinc-900">{importJob.id}</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Import review
          </h1>

          <div className="text-sm text-zinc-600">
            <span className="font-medium">{company.name ?? company.slug}</span>
            {" · "}
            {importJob.file_name ?? "Unnamed file"}
            {" · "}
            {formatDate(importJob.created_at)}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3">
          <BootstrapWorksButton
            companySlug={companySlug}
            companyId={company.id}
            importJobId={importJobId}
          />

          <RunMatchingV3Button
            companySlug={companySlug}
            importJobId={importJobId}
          />

          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
            <div className="font-medium text-zinc-900">Current goal</div>
            <div className="mt-1 text-zinc-600">
              Bootstrap missing works, then max out match coverage before
              splits/allocation.
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total rows" value={totalRows} />
        <StatCard label="Matched rows" value={matchedRows} />
        <StatCard label="Unmatched rows" value={unmatchedRows} />
        <StatCard label="Match %" value={formatPercent(matchPct)} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="ISRC exact" value={sourceCounts.isrc_exact} />
        <StatCard
          label="Title/artist exact"
          value={sourceCounts.title_artist_exact}
        />
        <StatCard label="Fuzzy" value={sourceCounts.fuzzy} />
        <StatCard label="Manual" value={sourceCounts.manual} />
        <StatCard label="Other source" value={sourceCounts.other} />
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">
                Allocation engine
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Allocate matched rows to parties using work splits.
              </p>
            </div>

            <RunAllocationButton
              companySlug={companySlug}
              importJobId={importJobId}
            />
          </div>

          {!latestAllocationRun ? (
            <p className="mt-4 text-sm text-zinc-600">No allocation run yet.</p>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <StatCard label="Status" value={latestAllocationRun.status} />
                <StatCard
                  label="Total input rows"
                  value={latestAllocationRun.total_input_rows}
                />
                <StatCard
                  label="Eligible rows"
                  value={latestAllocationRun.eligible_rows}
                />
                <StatCard
                  label="Allocation rows"
                  value={latestAllocationRun.allocated_rows}
                />
                <StatCard
                  label="Skipped unmatched"
                  value={latestAllocationRun.skipped_unmatched_rows}
                />
                <StatCard
                  label="Skipped bad/missing splits"
                  value={
                    latestAllocationRun.skipped_missing_splits_rows +
                    latestAllocationRun.skipped_invalid_split_rows
                  }
                />
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-zinc-900">Party totals</h3>

                {allocationPartyTotals.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-600">
                    No allocations created yet.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-50 text-left">
                        <tr className="border-b border-zinc-200">
                          <th className="px-4 py-3 font-semibold text-zinc-700">
                            Party
                          </th>
                          <th className="px-4 py-3 font-semibold text-zinc-700">
                            Allocated amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocationPartyTotals.map((row) => (
                          <tr key={row.partyId} className="border-b border-zinc-100">
                            <td className="px-4 py-3 text-zinc-900">
                              {row.partyName}
                            </td>
                            <td className="px-4 py-3 text-zinc-700">
                              {row.allocatedAmount.toFixed(6)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Unmatched rows</h2>
          <p className="text-sm text-zinc-600">
            First 200 unmatched rows for this import. Manual matches update coverage
            directly.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr className="border-b border-zinc-200">
                <th className="px-4 py-3 font-semibold text-zinc-700">Row</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Title</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Artist</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">ISRC</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Store</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Country</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Revenue</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Period</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {unmatchedRowsList.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    No unmatched rows. Coverage is complete for this page slice.
                  </td>
                </tr>
              ) : (
                unmatchedRowsList.map((row) => {
                  const view = getRowView(row.raw);

                  return (
                    <tr key={row.id} className="border-b border-zinc-100 align-top">
                      <td className="px-4 py-4 text-zinc-700">
                        {row.row_number ?? "—"}
                      </td>
                      <td className="px-4 py-4 font-medium text-zinc-900">
                        {view.title || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {view.artist || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {view.isrc || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {view.store || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {view.country || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {view.netRevenue || "—"}{" "}
                        <span className="text-zinc-500">{view.currency}</span>
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {view.period || "—"}
                      </td>
                      <td className="px-4 py-4">
                        <ManualMatchCell
                          companySlug={companySlug}
                          importJobId={importJobId}
                          rowId={row.id}
                          rowTitle={view.title}
                          rowArtist={view.artist}
                          rowIsrc={view.isrc}
                          works={works}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Recently matched rows</h2>
          <p className="text-sm text-zinc-600">
            Quick audit view plus clear-match action if something was linked wrong.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr className="border-b border-zinc-200">
                <th className="px-4 py-3 font-semibold text-zinc-700">Row</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Title</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Artist</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">ISRC</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Source</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Confidence</th>
                <th className="px-4 py-3 font-semibold text-zinc-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentMatchedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    No matched rows yet.
                  </td>
                </tr>
              ) : (
                recentMatchedRows.map((row) => {
                  const view = getRowView(row.raw);

                  return (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="px-4 py-4 text-zinc-700">
                        {row.row_number ?? "—"}
                      </td>
                      <td className="px-4 py-4 font-medium text-zinc-900">
                        {view.title || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {view.artist || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {view.isrc || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {row.match_source || "—"}
                      </td>
                      <td className="px-4 py-4 text-zinc-700">
                        {row.match_confidence ?? "—"}
                      </td>
                      <td className="px-4 py-4">
                        <ClearMatchButton
                          companySlug={companySlug}
                          importJobId={importJobId}
                          rowId={row.id}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}