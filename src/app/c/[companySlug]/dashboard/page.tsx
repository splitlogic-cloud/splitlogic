import "server-only";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DashboardGroup = {
  name: string;
  amount: number;
  rows: number;
};

type AggregationRow = {
  title: string;
  territory: string;
  service: string;
  amount: number;
  currency: string | null;
};

type DashboardHighlights = {
  source: "revenue_rows" | "import_rows" | "none";
  totalRecordedAmount: number;
  currencyLabel: string;
  topSongs: DashboardGroup[];
  topCountries: DashboardGroup[];
  topServices: DashboardGroup[];
  warnings: string[];
};

const MAX_IMPORT_JOBS = 150;
const MAX_IMPORT_ROWS = 12000;

function isSchemaCompatibilityError(message: string) {
  return (
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value).trim();
  if (!text) return null;

  const normalized = text
    .replace(/\u00A0/g, "")
    .replace(/\s/g, "")
    .replace(/(?<=\d),(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickStringFromRecords(records: Array<Record<string, unknown> | null>, keys: string[]) {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const text = toNullableString(record[key]);
      if (text) return text;
    }
  }
  return null;
}

function pickNumberFromRecords(records: Array<Record<string, unknown> | null>, keys: string[]) {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = toNullableNumber(record[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function normalizeServiceCandidate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;

  // Generic ingestion/source labels are not useful for a service ranking card.
  if (["ROYALTY", "SOURCE", "IMPORT", "STATEMENT", "REPORT"].includes(normalized)) {
    return null;
  }

  return normalized;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(amount);
}

function buildDashboardHighlights(
  rows: AggregationRow[],
  source: DashboardHighlights["source"],
  warnings: string[]
): DashboardHighlights {
  const totalRecordedAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const currencies = new Set(
    rows
      .map((row) => row.currency?.trim().toUpperCase() ?? null)
      .filter((value): value is string => Boolean(value))
  );
  const currencyLabel =
    currencies.size === 1 ? Array.from(currencies)[0] : currencies.size > 1 ? "MIXED" : "—";

  const songsMap = new Map<string, DashboardGroup>();
  const countriesMap = new Map<string, DashboardGroup>();
  const servicesMap = new Map<string, DashboardGroup>();

  for (const row of rows) {
    const songKey = row.title || "Unknown track";
    const countryKey = row.territory || "Unknown";

    const songCurrent = songsMap.get(songKey) ?? { name: songKey, amount: 0, rows: 0 };
    songCurrent.amount += row.amount;
    songCurrent.rows += 1;
    songsMap.set(songKey, songCurrent);

    const countryCurrent = countriesMap.get(countryKey) ?? {
      name: countryKey,
      amount: 0,
      rows: 0,
    };
    countryCurrent.amount += row.amount;
    countryCurrent.rows += 1;
    countriesMap.set(countryKey, countryCurrent);

    const serviceKey = row.service || "Unknown service";
    const serviceCurrent = servicesMap.get(serviceKey) ?? {
      name: serviceKey,
      amount: 0,
      rows: 0,
    };
    serviceCurrent.amount += row.amount;
    serviceCurrent.rows += 1;
    servicesMap.set(serviceKey, serviceCurrent);
  }

  const sortGroups = (items: DashboardGroup[]) =>
    items.sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.name.localeCompare(b.name, "sv");
    });

  return {
    source,
    totalRecordedAmount,
    currencyLabel,
    topSongs: sortGroups(Array.from(songsMap.values())).slice(0, 5),
    topCountries: sortGroups(Array.from(countriesMap.values())).slice(0, 5),
    topServices: sortGroups(Array.from(servicesMap.values())).slice(0, 5),
    warnings,
  };
}

async function loadRowsFromRevenueTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<{ rows: AggregationRow[]; warnings: string[]; used: boolean }> {
  const { data, error } = await supabase
    .from("revenue_rows")
    .select("work_ref,external_track_id,territory,currency,amount_net,source_system")
    .eq("company_id", companyId)
    .limit(5000);

  if (error) {
    if (isSchemaCompatibilityError(error.message)) {
      return { rows: [], warnings: [], used: false };
    }
    return {
      rows: [],
      warnings: [`Revenue rows unavailable: ${error.message}`],
      used: false,
    };
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const amount = toNullableNumber(row.amount_net);
      if (amount === null) return null;

      const title =
        toNullableString(row.work_ref) ??
        toNullableString(row.external_track_id) ??
        "Unknown track";
      const territory = (toNullableString(row.territory) ?? "Unknown").toUpperCase();
      const currency = toNullableString(row.currency)?.toUpperCase() ?? null;
      const service = toNullableString(row.source_system)?.toUpperCase() ?? "UNKNOWN";

      return { title, territory, service, amount, currency };
    })
    .filter((row): row is AggregationRow => Boolean(row));

  return { rows, warnings: [], used: true };
}

async function loadImportRowsForColumn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  keyColumn: "import_job_id" | "import_id",
  importIds: string[]
): Promise<{ rows: Record<string, unknown>[]; warnings: string[]; supported: boolean }> {
  const selectVariants = [
    "id, net_amount, currency, canonical, normalized, raw",
    "id, net_amount, canonical, normalized, raw",
    "id, canonical, normalized, raw",
    "id, raw",
  ] as const;

  for (const selectColumns of selectVariants) {
    let schemaErrorCount = 0;
    const collected: Record<string, unknown>[] = [];

    for (const chunk of chunkArray(importIds, 40)) {
      const { data, error } = await supabase
        .from("import_rows")
        .select(selectColumns)
        .in(keyColumn, chunk);

      if (error) {
        if (isSchemaCompatibilityError(error.message)) {
          schemaErrorCount += 1;
          break;
        }
        return { rows: [], warnings: [`Import rows query failed: ${error.message}`], supported: true };
      }

      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        collected.push(row);
        if (collected.length >= MAX_IMPORT_ROWS) break;
      }
      if (collected.length >= MAX_IMPORT_ROWS) break;
    }

    if (schemaErrorCount === 0) {
      return { rows: collected, warnings: [], supported: true };
    }
  }

  return { rows: [], warnings: [], supported: false };
}

function mapImportRowToAggregationRow(row: Record<string, unknown>): AggregationRow | null {
  const canonical = asRecord(row.canonical);
  const normalized = asRecord(row.normalized);
  const raw = asRecord(row.raw);
  const records = [row, canonical, normalized, raw];

  const amount = pickNumberFromRecords(records, [
    "net_amount",
    "amount_net",
    "net_revenue",
    "net",
    "amount",
    "royalty_amount",
    "Net Amount",
    "Net Revenue",
    "Amount",
    "Net Share Account Currency",
  ]);
  if (amount === null) return null;

  const title =
    pickStringFromRecords(records, [
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

  const territory =
    (pickStringFromRecords(records, [
      "territory",
      "country",
      "sale_country",
      "Territory",
      "Country",
      "Sale Country",
    ]) ?? "Unknown")
      .trim()
      .toUpperCase() || "Unknown";

  const currency =
    pickStringFromRecords(records, ["currency", "currency_code", "Currency", "Currency Code"])?.toUpperCase() ??
    null;

  const service =
    normalizeServiceCandidate(
      pickStringFromRecords(records, [
        "service",
        "platform",
        "store",
        "dsp",
        "channel",
        "retailer",
        "Service",
        "Platform",
        "Store",
        "DSP",
        "Channel",
        "Retailer",
      ])
    ) ??
    normalizeServiceCandidate(
      pickStringFromRecords(records, [
        "source_name",
        "source_system",
        "source",
        "Source Name",
        "Source System",
        "Source",
      ])
    ) ??
    "UNKNOWN";

  return { title, territory, service: service.toUpperCase(), amount, currency };
}

async function loadRowsFromImportRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<{ rows: AggregationRow[]; warnings: string[]; used: boolean }> {
  const warnings: string[] = [];

  const { data: importJobs, error: jobsError } = await supabase
    .from("import_jobs")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(MAX_IMPORT_JOBS);

  if (jobsError) {
    return {
      rows: [],
      warnings: [`Import jobs unavailable: ${jobsError.message}`],
      used: false,
    };
  }

  const importIds = (importJobs ?? [])
    .map((job) => toNullableString(job.id))
    .filter((id): id is string => Boolean(id));

  if (importIds.length === 0) {
    return { rows: [], warnings, used: true };
  }

  const importJobRows = await loadImportRowsForColumn(supabase, "import_job_id", importIds);
  const legacyImportRows = await loadImportRowsForColumn(supabase, "import_id", importIds);
  warnings.push(...importJobRows.warnings, ...legacyImportRows.warnings);

  const rowMap = new Map<string, Record<string, unknown>>();
  const addRows = (items: Record<string, unknown>[]) => {
    for (const item of items) {
      const key = toNullableString(item.id) ?? JSON.stringify(item);
      if (!rowMap.has(key)) rowMap.set(key, item);
    }
  };
  addRows(importJobRows.rows);
  addRows(legacyImportRows.rows);

  if (!importJobRows.supported && !legacyImportRows.supported) {
    warnings.push("Import rows schema does not expose import key columns for dashboard analytics.");
    return { rows: [], warnings, used: false };
  }

  const rows = Array.from(rowMap.values())
    .map(mapImportRowToAggregationRow)
    .filter((row): row is AggregationRow => Boolean(row));

  return { rows, warnings, used: true };
}

async function loadDashboardHighlights(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<DashboardHighlights> {
  const revenueRows = await loadRowsFromRevenueTable(supabase, companyId);
  if (revenueRows.used && revenueRows.rows.length > 0) {
    return buildDashboardHighlights(revenueRows.rows, "revenue_rows", revenueRows.warnings);
  }

  const importRows = await loadRowsFromImportRows(supabase, companyId);
  if (importRows.rows.length > 0) {
    return buildDashboardHighlights(importRows.rows, "import_rows", [
      ...revenueRows.warnings,
      ...importRows.warnings,
    ]);
  }

  return buildDashboardHighlights([], "none", [...revenueRows.warnings, ...importRows.warnings]);
}

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`load company failed: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const [
    importsCountRes,
    worksCountRes,
    partiesCountRes,
    statementsCountRes,
    latestImportRes,
  ] = await Promise.all([
    supabase
      .from("import_jobs")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id),

    supabase
      .from("works")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id),

    supabase
      .from("parties")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id),

    supabase
      .from("statements")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id),

    supabase
      .from("import_jobs")
      .select("id,status,created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const importsCount = importsCountRes.count ?? 0;
  const worksCount = worksCountRes.count ?? 0;
  const partiesCount = partiesCountRes.count ?? 0;
  const statementsCount = statementsCountRes.count ?? 0;

  const latestImport = latestImportRes.data;
  const highlights = await loadDashboardHighlights(supabase, company.id);

  const warnings = [
    importsCountRes.error ? `Imports: ${importsCountRes.error.message}` : null,
    worksCountRes.error ? `Works: ${worksCountRes.error.message}` : null,
    partiesCountRes.error ? `Parties: ${partiesCountRes.error.message}` : null,
    statementsCountRes.error ? `Statements: ${statementsCountRes.error.message}` : null,
    latestImportRes.error ? `Latest import: ${latestImportRes.error.message}` : null,
    ...highlights.warnings,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-500">Overview</div>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Company: {company.name || company.slug}
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Imports</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {importsCount}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            {latestImport?.created_at
              ? `Latest: ${new Date(latestImport.created_at)
                  .toISOString()
                  .slice(0, 10)}`
              : "No imports yet"}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Works</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {worksCount}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Catalog rows in works table
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Parties</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {partiesCount}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Rights holders / recipients
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Statements</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {statementsCount}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Generated statements
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Inspelad summa</h2>
          <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {formatAmount(highlights.totalRecordedAmount)}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Currency: {highlights.currencyLabel} · Source:{" "}
            {highlights.source === "revenue_rows"
              ? "revenue_rows"
              : highlights.source === "import_rows"
                ? "import_rows"
                : "no data"}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Top 5 låtar</h2>
          {highlights.topSongs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Ingen data ännu.</p>
          ) : (
            <ol className="mt-4 space-y-2 text-sm">
              {highlights.topSongs.map((song, index) => (
                <li key={`${song.name}-${index}`} className="flex items-start justify-between gap-3">
                  <span className="text-slate-700">
                    {index + 1}. {song.name}
                  </span>
                  <span className="font-medium text-slate-900">{formatAmount(song.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Top 5 länder</h2>
          {highlights.topCountries.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Ingen data ännu.</p>
          ) : (
            <ol className="mt-4 space-y-2 text-sm">
              {highlights.topCountries.map((country, index) => (
                <li
                  key={`${country.name}-${index}`}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="text-slate-700">
                    {index + 1}. {country.name}
                  </span>
                  <span className="font-medium text-slate-900">{formatAmount(country.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Top 5 service</h2>
          {highlights.topServices.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Ingen data ännu.</p>
          ) : (
            <ol className="mt-4 space-y-2 text-sm">
              {highlights.topServices.map((service, index) => (
                <li
                  key={`${service.name}-${index}`}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="text-slate-700">
                    {index + 1}. {service.name}
                  </span>
                  <span className="font-medium text-slate-900">{formatAmount(service.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            Latest import
          </h2>

          {latestImport ? (
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <div>
                <span className="font-medium text-slate-900">Date:</span>{" "}
                {latestImport.created_at
                  ? new Date(latestImport.created_at).toISOString().slice(0, 10)
                  : "—"}
              </div>
              <div>
                <span className="font-medium text-slate-900">Status:</span>{" "}
                {latestImport.status || "—"}
              </div>
              <div>
                <span className="font-medium text-slate-900">Import ID:</span>{" "}
                {latestImport.id}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No imports yet.</p>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            Status
          </h2>

          {warnings.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Dashboard data loaded correctly.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                >
                  {warning}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}