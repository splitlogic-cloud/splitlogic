import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
  searchParams?: Promise<{
    periodStart?: string;
    periodEnd?: string;
    country?: string;
    title?: string;
    artist?: string;
    service?: string;
  }>;
};

type ReportRow = {
  title: string;
  artist: string;
  country: string;
  service: string;
  statementDate: string | null;
  amount: number;
  currency: string | null;
};

type GroupItem = {
  name: string;
  amount: number;
  rows: number;
};

const MAX_IMPORT_JOBS = 100;
const MAX_IMPORT_ROWS = 10000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\u00A0/g, "")
    .replace(/\s/g, "")
    .replace(/(?<=\d),(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find")
  );
}

function pickString(records: Array<Record<string, unknown> | null>, keys: string[]): string | null {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function pickNumber(records: Array<Record<string, unknown> | null>, keys: string[]): number | null {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = asNumber(record[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const maybeDate = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) return maybeDate;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return value;
}

function parsePositiveInt(value: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

function buildReportQuery(params: {
  periodStart: string;
  periodEnd: string;
  countryFilter: string;
  titleFilter: string;
  artistFilter: string;
  serviceFilter: string;
  page?: number;
}): string {
  const qp = new URLSearchParams();
  if (params.periodStart) qp.set("periodStart", params.periodStart);
  if (params.periodEnd) qp.set("periodEnd", params.periodEnd);
  if (params.countryFilter) qp.set("country", params.countryFilter);
  if (params.titleFilter) qp.set("title", params.titleFilter);
  if (params.artistFilter) qp.set("artist", params.artistFilter);
  if (params.serviceFilter) qp.set("service", params.serviceFilter);
  if (typeof params.page === "number") qp.set("page", String(params.page));
  return qp.toString();
}

function groupTop(rows: ReportRow[], key: "title" | "artist" | "country"): GroupItem[] {
  const map = new Map<string, GroupItem>();
  for (const row of rows) {
    const name = (row[key] || "Unknown").trim() || "Unknown";
    const current = map.get(name) ?? { name, amount: 0, rows: 0 };
    current.amount += row.amount;
    current.rows += 1;
    map.set(name, current);
  }
  return [...map.values()]
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : a.name.localeCompare(b.name, "sv")))
    .slice(0, 10);
}

function mapImportRowToReportRow(row: Record<string, unknown>): ReportRow | null {
  const canonical = asRecord(row.canonical);
  const normalized = asRecord(row.normalized);
  const raw = asRecord(row.raw);
  const records = [row, canonical, normalized, raw];

  const amount = pickNumber(records, [
    "net_amount",
    "amount_net",
    "net_revenue",
    "amount",
    "royalty_amount",
    "Net Amount",
    "Net Revenue",
    "Amount",
    "Net Share Account Currency",
  ]);
  if (amount === null) return null;

  const title =
    pickString(records, [
      "title",
      "track_name",
      "track",
      "song_title",
      "work_ref",
      "Track Name",
      "Track",
      "Title",
      "Song Title",
    ]) ?? "Unknown track";

  const artist =
    pickString(records, [
      "artist",
      "artist_name",
      "main_artist",
      "Artist",
      "Artist Name",
      "Main Artist",
    ]) ?? "Unknown artist";

  const country =
    (pickString(records, [
      "territory",
      "country",
      "sale_country",
      "Territory",
      "Country",
      "Sale Country",
    ]) ?? "Unknown")
      .trim()
      .toUpperCase() || "UNKNOWN";

  const service =
    (pickString(records, [
      "service",
      "platform",
      "store",
      "dsp",
      "source_name",
      "source_system",
      "Service",
      "Platform",
      "Store",
      "DSP",
      "Source Name",
      "Source System",
    ]) ?? "Unknown")
      .trim()
      .toUpperCase() || "UNKNOWN";

  const statementDate = normalizeDate(
    pickString(records, [
      "statement_date",
      "sale_date",
      "earning_date",
      "date",
      "Statement Date",
      "Sale Date",
      "Earning Date",
      "Date",
    ])
  );

  const currency =
    pickString(records, ["currency", "currency_code", "Currency", "Currency Code"])?.toUpperCase() ??
    null;

  return {
    title,
    artist,
    country,
    service,
    statementDate,
    amount,
    currency,
  };
}

async function loadReportRows(companyId: string): Promise<ReportRow[]> {
  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from("import_jobs")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(MAX_IMPORT_JOBS);

  if (jobsError) {
    throw new Error(`Failed to load import jobs: ${jobsError.message}`);
  }

  const importIds = (jobs ?? [])
    .map((row) => asString((row as Record<string, unknown>).id))
    .filter((v): v is string => Boolean(v));

  if (importIds.length === 0) {
    return [];
  }

  const allRows = new Map<string, Record<string, unknown>>();
  const selectAttempts = [
    "id, net_amount, currency, canonical, normalized, raw",
    "id, net_amount, canonical, normalized, raw",
    "id, canonical, normalized, raw",
    "id, raw",
  ] as const;

  const loadForColumn = async (column: "import_job_id" | "import_id") => {
    for (const selectColumns of selectAttempts) {
      let schemaFailed = false;
      for (const chunk of chunkArray(importIds, 40)) {
        const { data, error } = await supabaseAdmin
          .from("import_rows")
          .select(selectColumns)
          .in(column, chunk)
          .limit(MAX_IMPORT_ROWS);

        if (error) {
          if (isSchemaCompatibilityError(error.message)) {
            schemaFailed = true;
            break;
          }
          throw new Error(`Failed to load import rows: ${error.message}`);
        }

        for (const row of ((data ?? []) as unknown[]).map(
          (item) => item as Record<string, unknown>
        )) {
          const key = asString(row.id) ?? JSON.stringify(row);
          if (!allRows.has(key)) allRows.set(key, row);
        }
      }

      if (!schemaFailed) return;
    }
  };

  await loadForColumn("import_job_id");
  await loadForColumn("import_id");

  return [...allRows.values()]
    .map(mapImportRowToReportRow)
    .filter((row): row is ReportRow => Boolean(row));
}

export default async function ReportPage({ params, searchParams }: PageProps) {
  const { companySlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const periodStart = asString(resolvedSearchParams.periodStart) ?? "";
  const periodEnd = asString(resolvedSearchParams.periodEnd) ?? "";
  const countryFilter = (asString(resolvedSearchParams.country) ?? "").toUpperCase();
  const titleFilterRaw = asString(resolvedSearchParams.title) ?? "";
  const artistFilterRaw = asString(resolvedSearchParams.artist) ?? "";
  const serviceFilter = (asString(resolvedSearchParams.service) ?? "").toUpperCase();
  const titleFilter = titleFilterRaw.toLowerCase();
  const artistFilter = artistFilterRaw.toLowerCase();
  const page = parsePositiveInt(asString((resolvedSearchParams as Record<string, string>).page ?? null));
  const pageSize = 50;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,slug,name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }
  if (!company) {
    notFound();
  }

  const allRows = await loadReportRows(String((company as Record<string, unknown>).id));

  const filteredRows = allRows.filter((row) => {
    if (periodStart && (!row.statementDate || row.statementDate < periodStart)) return false;
    if (periodEnd && (!row.statementDate || row.statementDate > periodEnd)) return false;
    if (countryFilter && row.country !== countryFilter) return false;
    if (titleFilter && !row.title.toLowerCase().includes(titleFilter)) return false;
    if (artistFilter && !row.artist.toLowerCase().includes(artistFilter)) return false;
    if (serviceFilter && row.service !== serviceFilter) return false;
    return true;
  });

  const titleOptions = [...new Set(allRows.map((row) => row.title).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "sv"))
    .slice(0, 400);
  const artistOptions = [...new Set(allRows.map((row) => row.artist).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "sv"))
    .slice(0, 400);
  const countryOptions = [...new Set(allRows.map((row) => row.country).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "sv"))
    .slice(0, 300);
  const serviceOptions = [...new Set(allRows.map((row) => row.service).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "sv"))
    .slice(0, 300);

  const totalAmount = filteredRows.reduce((sum, row) => sum + row.amount, 0);
  const currencies = [...new Set(filteredRows.map((row) => row.currency).filter((v): v is string => Boolean(v)))];
  const topSongs = groupTop(filteredRows, "title");
  const topArtists = groupTop(filteredRows, "artist");
  const topCountries = groupTop(filteredRows, "country");

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(offset, offset + pageSize);

  const queryForPage = (nextPage: number) =>
    buildReportQuery({
      periodStart,
      periodEnd,
      countryFilter,
      titleFilter: titleFilterRaw,
      artistFilter: artistFilterRaw,
      serviceFilter,
      page: nextPage,
    });

  const pdfHref = `/c/${companySlug}/report/pdf?${buildReportQuery({
    periodStart,
    periodEnd,
    countryFilter,
    titleFilter: titleFilterRaw,
    artistFilter: artistFilterRaw,
    serviceFilter,
  })}`;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-slate-500">Report</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Reports</h1>
        <p className="mt-2 text-sm text-slate-600">
          Filtrera och analysera rapportdata per land, låt, artist och datum.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid gap-4 md:grid-cols-6">
          <div>
            <label htmlFor="periodStart" className="mb-1 block text-sm font-medium text-slate-700">
              Period start
            </label>
            <input
              id="periodStart"
              name="periodStart"
              type="date"
              defaultValue={periodStart}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="periodEnd" className="mb-1 block text-sm font-medium text-slate-700">
              Period end
            </label>
            <input
              id="periodEnd"
              name="periodEnd"
              type="date"
              defaultValue={periodEnd}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="country" className="mb-1 block text-sm font-medium text-slate-700">
              Land
            </label>
            <select
              id="country"
              name="country"
              defaultValue={countryFilter}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {countryOptions.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
              Låt
            </label>
            <select
              id="title"
              name="title"
              defaultValue={titleFilterRaw}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {titleOptions.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="artist" className="mb-1 block text-sm font-medium text-slate-700">
              Artist
            </label>
            <select
              id="artist"
              name="artist"
              defaultValue={artistFilterRaw}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {artistOptions.map((artist) => (
                <option key={artist} value={artist}>
                  {artist}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="service" className="mb-1 block text-sm font-medium text-slate-700">
              Service
            </label>
            <select
              id="service"
              name="service"
              defaultValue={serviceFilter}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {serviceOptions.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-6 flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Apply filters
            </button>
            <Link
              href={pdfHref}
              className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Export PDF
            </Link>
            <Link
              href={`/c/${companySlug}/report`}
              className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Reset
            </Link>
          </div>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Rows</div>
          <div className="mt-2 text-xl font-semibold">{filteredRows.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Inspelad summa</div>
          <div className="mt-2 text-xl font-semibold">{formatAmount(totalAmount)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Currencies</div>
          <div className="mt-2 text-xl font-semibold">
            {currencies.length > 0 ? currencies.join(", ") : "—"}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Company</div>
          <div className="mt-2 text-xl font-semibold">
            {asString((company as Record<string, unknown>).name) ??
              asString((company as Record<string, unknown>).slug) ??
              "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Top låtar</h2>
          {topSongs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Ingen data.</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {topSongs.slice(0, 5).map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                  <span>
                    {index + 1}. {item.name}
                  </span>
                  <span className="font-medium">{formatAmount(item.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Top artister</h2>
          {topArtists.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Ingen data.</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {topArtists.slice(0, 5).map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                  <span>
                    {index + 1}. {item.name}
                  </span>
                  <span className="font-medium">{formatAmount(item.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Top länder</h2>
          {topCountries.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Ingen data.</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {topCountries.slice(0, 5).map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                  <span>
                    {index + 1}. {item.name}
                  </span>
                  <span className="font-medium">{formatAmount(item.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b px-4 py-3 text-sm font-medium text-slate-700">Rows</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Country</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Title</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Artist</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Service</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No rows for selected filters.
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr key={`${row.title}-${row.artist}-${row.country}-${row.statementDate}-${index}`}>
                  <td className="px-4 py-3">{formatDate(row.statementDate)}</td>
                  <td className="px-4 py-3">{row.country}</td>
                  <td className="px-4 py-3">{row.title}</td>
                  <td className="px-4 py-3">{row.artist}</td>
                  <td className="px-4 py-3">{row.service}</td>
                  <td className="px-4 py-3">
                    {formatAmount(row.amount)} {row.currency ?? ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          <div className="text-slate-600">
            Page {currentPage} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={`/c/${companySlug}/report?${queryForPage(currentPage - 1)}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
              >
                Previous
              </Link>
            ) : null}
            {currentPage < totalPages ? (
              <Link
                href={`/c/${companySlug}/report?${queryForPage(currentPage + 1)}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
