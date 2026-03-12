import "server-only";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RawRecord = Record<string, unknown>;

type ReviewRow = {
  title: string;
  artist: string;
  isrc: string;
  store: string;
  country: string;
  netAccountAmount: string;
  accountCurrency: string;
  grossSaleAmount: string;
  saleCurrency: string;
  period: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function asRecord(value: unknown): RawRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as RawRecord;
}

function normalizeKey(key: string) {
  return key
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");
}

function buildNormalizedRecord(record: RawRecord) {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    normalized[normalizeKey(key)] = value;
  }

  return normalized;
}

function isMeaningfulValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function toDisplayString(value: unknown) {
  if (value === null || value === undefined) return "—";

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : "—";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function findValue(record: RawRecord | null, candidates: string[]) {
  if (!record) return null;

  const normalized = buildNormalizedRecord(record);

  for (const candidate of candidates) {
    const value = normalized[normalizeKey(candidate)];
    if (isMeaningfulValue(value)) {
      return value;
    }
  }

  return null;
}

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

function extractReviewFields(raw: unknown): ReviewRow {
  const record = asRecord(raw);

  if (!record) {
    return {
      title: "—",
      artist: "—",
      isrc: "—",
      store: "—",
      country: "—",
      netAccountAmount: "—",
      accountCurrency: "—",
      grossSaleAmount: "—",
      saleCurrency: "—",
      period: "—",
    };
  }

  const title = toDisplayString(
    findValue(record, [
      "track",
      "TRACK",
      "title",
      "Title",
      "product",
      "PRODUCT",
      "asset_title",
      "Asset Title",
      "song_title",
      "track_title",
      "work_title",
      "release_title",
      "name",
    ])
  );

  const artist = toDisplayString(
    findValue(record, [
      "track_artist",
      "TRACK ARTIST",
      "product_artist",
      "PRODUCT ARTIST",
      "asset_artist",
      "Asset Artist",
      "artist",
      "artist_name",
      "main_artist",
      "party_name",
    ])
  );

  const isrc = toDisplayString(
    findValue(record, ["isrc", "ISRC", "asset_isrc", "Asset ISRC"])
  );

  const store = toDisplayString(
    findValue(record, [
      "store",
      "STORE",
      "dsp",
      "DSP",
      "sale_store_name",
      "Sale Store Name",
      "service_detail",
      "SERVICE DETAIL",
    ])
  );

  const country = toDisplayString(
    findValue(record, [
      "sale_country",
      "SALE COUNTRY",
      "country",
      "Country",
      "territory",
      "TERRITORY",
    ])
  );

  const accountCurrency = toDisplayString(
    findValue(record, ["account_currency", "ACCOUNT CURRENCY"])
  );

  const saleCurrency = toDisplayString(
    findValue(record, [
      "sale_currency",
      "SALE CURRENCY",
      "currency",
      "Currency",
      "currency_code",
    ])
  );

  const netAccountAmount = toDisplayString(
    findValue(record, [
      "net_share_account_currency",
      "NET SHARE ACCOUNT CURRENCY",
      "net_amount_account_currency",
    ])
  );

  const grossSaleAmount = toDisplayString(
    findValue(record, [
      "gross_revenue_sale_currency",
      "GROSS REVENUE SALE CURRENCY",
      "gross_sale_amount",
      "unit_price_sale_currency",
      "UNIT PRICE SALE CURRENCY",
    ])
  );

  const periodStart = findValue(record, [
    "sale_start_date",
    "SALE START DATE",
    "period_start",
    "start_date",
    "from",
  ]);

  const periodEnd = findValue(record, [
    "sale_end_date",
    "SALE END DATE",
    "period_end",
    "end_date",
    "to",
  ]);

  let period = toDisplayString(
    findValue(record, [
      "statement_period",
      "STATEMENT PERIOD",
      "original_statement_period",
      "ORIGINAL STATEMENT PERIOD",
      "period",
      "Period",
      "period_name",
      "sales_period",
      "earning_period",
      "month",
      "date",
    ])
  );

  if (
    period === "—" &&
    (isMeaningfulValue(periodStart) || isMeaningfulValue(periodEnd))
  ) {
    const start = toDisplayString(periodStart);
    const end = toDisplayString(periodEnd);

    if (start !== "—" && end !== "—") {
      period = `${start} → ${end}`;
    } else if (start !== "—") {
      period = start;
    } else if (end !== "—") {
      period = end;
    }
  }

  return {
    title,
    artist,
    isrc,
    store,
    country,
    netAccountAmount,
    accountCurrency,
    grossSaleAmount,
    saleCurrency,
    period,
  };
}

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; importJobId: string }>;
}) {
  const { companySlug, importJobId } = await params;

  if (!isUuid(importJobId)) {
    notFound();
  }

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

  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .select("id,file_name,filename,status,created_at,processed_at")
    .eq("company_id", company.id)
    .eq("id", importJobId)
    .maybeSingle();

  if (jobError) {
    throw new Error(`load import job failed: ${jobError.message}`);
  }

  const { count: totalRowsCount, error: countError } = await supabase
    .from("import_rows")
    .select("*", { count: "exact", head: true })
    .eq("import_id", importJobId);

  if (countError) {
    throw new Error(`count import rows failed: ${countError.message}`);
  }

  const reviewLimit = 200;

  const { data: rows, error: rowsError } = await supabase
    .from("import_rows")
    .select("id,row_number,raw,created_at")
    .eq("import_id", importJobId)
    .order("row_number", { ascending: true })
    .limit(reviewLimit);

  if (rowsError) {
    throw new Error(`load import rows failed: ${rowsError.message}`);
  }

  async function deleteImport() {
    "use server";

    const supabase = await createClient();

    const { data: currentCompany, error: currentCompanyError } = await supabase
      .from("companies")
      .select("id,slug")
      .eq("slug", companySlug)
      .maybeSingle();

    if (currentCompanyError) {
      throw new Error(`load company failed: ${currentCompanyError.message}`);
    }

    if (!currentCompany) {
      throw new Error("Company not found");
    }

    const { error: deleteRowsError } = await supabase
      .from("import_rows")
      .delete()
      .eq("import_id", importJobId);

    if (deleteRowsError) {
      throw new Error(`delete import rows failed: ${deleteRowsError.message}`);
    }

    const { error: deleteJobError } = await supabase
      .from("import_jobs")
      .delete()
      .eq("company_id", currentCompany.id)
      .eq("id", importJobId);

    if (deleteJobError) {
      throw new Error(`delete import failed: ${deleteJobError.message}`);
    }

    revalidatePath(`/c/${companySlug}/imports`);
    redirect(`/c/${companySlug}/imports`);
  }

  const parsedRows =
    rows?.map((row) => ({
      ...row,
      review: extractReviewFields(row.raw),
      rawPreview: compactJson(row.raw),
    })) ?? [];

  const fileName =
    (job as { file_name?: string | null; filename?: string | null } | null)
      ?.file_name ||
    (job as { file_name?: string | null; filename?: string | null } | null)
      ?.filename ||
    "—";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Import review</h1>
          <p className="text-sm text-slate-500">
            Review imported rows for company: {company.name || company.slug}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <form action={deleteImport}>
            <button
              type="submit"
              className="inline-flex rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50"
            >
              Delete import
            </button>
          </form>

          <Link
            href={`/c/${companySlug}/imports`}
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to imports
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {job ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div>
              <div className="text-sm text-slate-500">Import ID</div>
              <div className="mt-1 break-all text-sm font-medium text-slate-900">
                {job.id}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">File</div>
              <div className="mt-1 break-all text-sm font-medium text-slate-900">
                {fileName}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">Status</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.status || "—"}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">Created</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.created_at
                  ? new Date(job.created_at)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")
                  : "—"}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">Rows shown</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {parsedRows.length.toLocaleString("en-US")}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">Total rows</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {(totalRowsCount ?? 0).toLocaleString("en-US")}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Import job not found.</p>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Parsed row review</h2>
          <p className="mt-1 text-sm text-slate-500">
            Showing {parsedRows.length.toLocaleString("en-US")} of{" "}
            {(totalRowsCount ?? 0).toLocaleString("en-US")} rows.
          </p>
        </div>

        {!parsedRows.length ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            No import rows found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1800px]">
              <div className="grid grid-cols-[80px_1.4fr_1.3fr_170px_220px_130px_150px_140px_150px_120px_180px_2fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                <div>Row</div>
                <div>Title</div>
                <div>Artist</div>
                <div>ISRC</div>
                <div>Store</div>
                <div>Country</div>
                <div>Net account</div>
                <div>Account curr</div>
                <div>Gross sale</div>
                <div>Sale curr</div>
                <div>Period</div>
                <div>Raw preview</div>
              </div>

              {parsedRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[80px_1.4fr_1.3fr_170px_220px_130px_150px_140px_150px_120px_180px_2fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
                >
                  <div className="text-sm text-slate-900">
                    {row.row_number ?? "—"}
                  </div>

                  <div className="text-sm text-slate-900">
                    {row.review.title}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.artist}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.isrc}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.store}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.country}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.netAccountAmount}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.accountCurrency}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.grossSaleAmount}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.saleCurrency}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.period}
                  </div>

                  <div
                    className="truncate text-sm text-slate-500"
                    title={row.rawPreview}
                  >
                    {row.rawPreview}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}