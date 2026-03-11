import "server-only";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RawRecord;
}

function pickString(record: RawRecord | null, keys: string[]): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function pickNumberLike(record: RawRecord | null, keys: string[]): string | null {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
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

function extractReviewFields(raw: unknown) {
  const record = asRecord(raw);

  const title =
    pickString(record, [
      "title",
      "track_title",
      "song_title",
      "work_title",
      "release_title",
      "track",
      "song",
      "name",
    ]) || "—";

  const artist =
    pickString(record, [
      "artist",
      "artist_name",
      "party",
      "party_name",
      "performer",
      "main_artist",
      "recipient",
      "counterparty",
    ]) || "—";

  const amount =
    pickNumberLike(record, [
      "amount",
      "net_amount",
      "gross_amount",
      "royalty_amount",
      "revenue",
      "income",
      "total",
      "value",
    ]) || "—";

  const currency =
    pickString(record, [
      "currency",
      "currency_code",
      "curr",
    ]) || "—";

  const period =
    pickString(record, [
      "period",
      "period_name",
      "statement_period",
      "sales_period",
      "earning_period",
      "month",
      "date",
    ]) ||
    (() => {
      const start = pickString(record, ["period_start", "start_date", "from"]);
      const end = pickString(record, ["period_end", "end_date", "to"]);
      if (start && end) return `${start} → ${end}`;
      if (start) return start;
      if (end) return end;
      return "—";
    })();

  return {
    title,
    artist,
    amount,
    currency,
    period,
    rawPreview: compactJson(raw),
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
    .select("id,file_name,status,created_at,processed_at")
    .eq("company_id", company.id)
    .eq("id", importJobId)
    .maybeSingle();

  if (jobError) {
    throw new Error(`load import job failed: ${jobError.message}`);
  }

  const { data: rows, error: rowsError } = await supabase
    .from("import_rows")
    .select("id,row_number,raw,created_at")
    .eq("import_id", importJobId)
    .order("row_number", { ascending: true })
    .limit(200);

  if (rowsError) {
    throw new Error(`load import rows failed: ${rowsError.message}`);
  }

  async function deleteImport() {
    "use server";

    const supabase = await createClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id,slug")
      .eq("slug", companySlug)
      .maybeSingle();

    if (companyError) {
      throw new Error(`load company failed: ${companyError.message}`);
    }

    if (!company) {
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
      .eq("company_id", company.id)
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
    })) ?? [];

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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <div className="text-sm text-slate-500">Import ID</div>
              <div className="mt-1 break-all text-sm font-medium text-slate-900">
                {job.id}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-500">File</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {job.file_name || "—"}
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
              <div className="text-sm text-slate-500">Rows loaded</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {parsedRows.length}
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
            Heuristic preview from <code>raw</code>. This is the step before mapping
            and matching.
          </p>
        </div>

        {!parsedRows.length ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            No import rows found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1200px]">
              <div className="grid grid-cols-[80px_1.4fr_1.2fr_130px_110px_180px_2fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                <div>Row</div>
                <div>Title</div>
                <div>Artist / party</div>
                <div>Amount</div>
                <div>Currency</div>
                <div>Period</div>
                <div>Raw preview</div>
              </div>

              {parsedRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[80px_1.4fr_1.2fr_130px_110px_180px_2fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
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
                    {row.review.amount}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.currency}
                  </div>

                  <div className="text-sm text-slate-700">
                    {row.review.period}
                  </div>

                  <div className="truncate text-sm text-slate-500">
                    {row.review.rawPreview}
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