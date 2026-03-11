import "server-only";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

type RawRecord = Record<string, any>;

function asRecord(value: unknown): RawRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as RawRecord;
}

/* -------------------------------- */
/* FIELD EXTRACTION */
/* -------------------------------- */

function extractReviewFields(raw: unknown) {
  const r = asRecord(raw);

  if (!r) {
    return {
      title: "—",
      artist: "—",
      isrc: "—",
      store: "—",
      amount: "—",
      currency: "—",
      period: "—",
      country: "—",
    };
  }

  const title =
    r["TRACK"] ||
    r["PRODUCT"] ||
    r["Asset Title"] ||
    r["title"] ||
    "—";

  const artist =
    r["TRACK ARTIST"] ||
    r["PRODUCT ARTIST"] ||
    r["Asset Artist"] ||
    r["artist"] ||
    "—";

  const isrc =
    r["ISRC"] ||
    r["Asset ISRC"] ||
    r["isrc"] ||
    "—";

  const store =
    r["STORE"] ||
    r["Sale Store Name"] ||
    r["DSP"] ||
    "—";

  const country =
    r["SALE COUNTRY"] ||
    r["Territory"] ||
    r["country"] ||
    "—";

  const amount =
    r["USD"] ||
    r["Sale net receipts"] ||
    r["Reported Royalty"] ||
    r["amount"] ||
    "—";

  const currency =
    r["Currency"] ||
    (r["USD"] ? "USD" : r["SEK"] ? "SEK" : "—");

  const period =
    r["STATEMENT PERIOD"] ||
    r["Sale Start date"] ||
    r["period"] ||
    "—";

  return {
    title,
    artist,
    isrc,
    store,
    amount,
    currency,
    period,
    country,
  };
}

/* -------------------------------- */
/* PAGE */
/* -------------------------------- */

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

  const { data: company } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (!company) throw new Error("Company not found");

  const { data: job } = await supabase
    .from("import_jobs")
    .select("id,file_name,status,created_at")
    .eq("company_id", company.id)
    .eq("id", importJobId)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("import_rows")
    .select("id,row_number,raw")
    .eq("import_id", importJobId)
    .order("row_number", { ascending: true })
    .limit(200);

  async function deleteImport() {
    "use server";

    const supabase = await createClient();

    await supabase
      .from("import_rows")
      .delete()
      .eq("import_id", importJobId);

    await supabase
      .from("import_jobs")
      .delete()
      .eq("id", importJobId);

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

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Import review</h1>
          <p className="text-sm text-slate-500">
            {company.name}
          </p>
        </div>

        <div className="flex gap-3">
          <form action={deleteImport}>
            <button className="border rounded-xl px-4 py-2 text-red-600">
              Delete
            </button>
          </form>

          <Link
            href={`/c/${companySlug}/imports`}
            className="border rounded-xl px-4 py-2"
          >
            Back
          </Link>
        </div>
      </div>

      <div className="border rounded-2xl bg-white">

        <div className="grid grid-cols-[60px_1.5fr_1.5fr_160px_140px_120px_120px_140px_120px] gap-4 border-b px-6 py-4 text-xs text-slate-500 uppercase">

          <div>Row</div>
          <div>Title</div>
          <div>Artist</div>
          <div>ISRC</div>
          <div>Store</div>
          <div>Country</div>
          <div>Amount</div>
          <div>Currency</div>
          <div>Period</div>

        </div>

        {parsedRows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[60px_1.5fr_1.5fr_160px_140px_120px_120px_140px_120px] gap-4 border-b px-6 py-3 text-sm"
          >

            <div>{row.row_number}</div>
            <div>{row.review.title}</div>
            <div>{row.review.artist}</div>
            <div>{row.review.isrc}</div>
            <div>{row.review.store}</div>
            <div>{row.review.country}</div>
            <div>{row.review.amount}</div>
            <div>{row.review.currency}</div>
            <div>{row.review.period}</div>

          </div>
        ))}

      </div>
    </div>
  );
}