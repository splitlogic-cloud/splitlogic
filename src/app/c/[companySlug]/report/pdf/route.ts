import "server-only";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildReportPdf,
  type ReportPdfGroup,
  type ReportPdfRow,
} from "@/features/reports/build-report-pdf";

type RouteContext = {
  params: Promise<{
    companySlug: string;
  }>;
};

const MAX_IMPORT_JOBS = 100;
const MAX_IMPORT_ROWS = 10000;
const MAX_PDF_ROWS = 400;

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

function pickString(
  records: Array<Record<string, unknown> | null>,
  keys: string[]
): string | null {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function pickNumber(
  records: Array<Record<string, unknown> | null>,
  keys: string[]
): number | null {
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

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find")
  );
}

function groupTop(rows: ReportPdfRow[], key: "title" | "artist" | "country"): ReportPdfGroup[] {
  const map = new Map<string, ReportPdfGroup>();
  for (const row of rows) {
    const name = (row[key] || "Unknown").trim() || "Unknown";
    const current = map.get(name) ?? { name, amount: 0, rows: 0 };
    current.amount += row.amount;
    current.rows += 1;
    map.set(name, current);
  }

  return [...map.values()]
    .sort((a, b) =>
      b.amount !== a.amount ? b.amount - a.amount : a.name.localeCompare(b.name, "sv")
    )
    .slice(0, 10);
}

function mapImportRowToPdfRow(row: Record<string, unknown>): ReportPdfRow | null {
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
    ]) ?? "UNKNOWN")
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

async function loadReportRows(companyId: string): Promise<ReportPdfRow[]> {
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

  if (importIds.length === 0) return [];

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
    .map(mapImportRowToPdfRow)
    .filter((row): row is ReportPdfRow => Boolean(row));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

export async function GET(request: Request, context: RouteContext) {
  const { companySlug } = await context.params;
  const { searchParams } = new URL(request.url);

  const periodStart = asString(searchParams.get("periodStart")) ?? "";
  const periodEnd = asString(searchParams.get("periodEnd")) ?? "";
  const countryFilter = (asString(searchParams.get("country")) ?? "").toUpperCase();
  const titleFilterRaw = asString(searchParams.get("title")) ?? "";
  const artistFilterRaw = asString(searchParams.get("artist")) ?? "";
  const titleFilter = titleFilterRaw.toLowerCase();
  const artistFilter = artistFilterRaw.toLowerCase();

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,slug,name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    return new NextResponse("Company not found", { status: 404 });
  }

  const allRows = await loadReportRows(String((company as Record<string, unknown>).id));
  const filteredRows = allRows.filter((row) => {
    if (periodStart && (!row.statementDate || row.statementDate < periodStart)) return false;
    if (periodEnd && (!row.statementDate || row.statementDate > periodEnd)) return false;
    if (countryFilter && row.country !== countryFilter) return false;
    if (titleFilter && !row.title.toLowerCase().includes(titleFilter)) return false;
    if (artistFilter && !row.artist.toLowerCase().includes(artistFilter)) return false;
    return true;
  });

  const totalAmount = filteredRows.reduce((sum, row) => sum + row.amount, 0);
  const currencies = [
    ...new Set(filteredRows.map((row) => row.currency).filter((v): v is string => Boolean(v))),
  ];
  const rowsForPdf = filteredRows.slice(0, MAX_PDF_ROWS);
  const truncatedRowCount = Math.max(0, filteredRows.length - rowsForPdf.length);
  const generatedAt = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const pdfBytes = await buildReportPdf({
    companyName:
      asString((company as Record<string, unknown>).name) ??
      asString((company as Record<string, unknown>).slug) ??
      "Company",
    generatedAt,
    filters: {
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      country: countryFilter || null,
      title: titleFilterRaw || null,
      artist: artistFilterRaw || null,
    },
    totalRows: filteredRows.length,
    totalAmount,
    currencies,
    topSongs: groupTop(filteredRows, "title"),
    topArtists: groupTop(filteredRows, "artist"),
    topCountries: groupTop(filteredRows, "country"),
    rows: rowsForPdf,
    truncatedRowCount,
  });

  const pdfBuffer = toArrayBuffer(pdfBytes);
  const filename = `report-${companySlug}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
