import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(current);
      current = "";

      const hasContent = row.some((cell) => cell.trim() !== "");
      if (hasContent) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function toObjects(csvText: string) {
  const parsed = parseCsv(csvText);
  if (parsed.length === 0) return [];

  const headers = parsed[0].map((h) => h.trim());
  const body = parsed.slice(1);

  return body.map((cells) => {
    const obj: Record<string, string> = {};

    headers.forEach((header, index) => {
      obj[header || `column_${index + 1}`] = (cells[index] ?? "").trim();
    });

    return obj;
  });
}

export default async function UploadImportPage({
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

  async function uploadImport(formData: FormData) {
    "use server";

    const companySlugFromForm = String(formData.get("companySlug") || "").trim();
    const file = formData.get("file");

    if (!companySlugFromForm) {
      throw new Error("Missing company slug");
    }

    if (!(file instanceof File)) {
      throw new Error("No file uploaded");
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      throw new Error("Only CSV files are supported");
    }

    const csvText = await file.text();
    const records = toObjects(csvText);

    if (records.length === 0) {
      throw new Error("CSV contains no data rows");
    }

    const supabase = await createClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id,slug")
      .eq("slug", companySlugFromForm)
      .maybeSingle();

    if (companyError) {
      throw new Error(`load company failed: ${companyError.message}`);
    }

    if (!company) {
      throw new Error("Company not found");
    }

    const { data: importJob, error: importJobError } = await supabase
      .from("import_jobs")
      .insert({
        company_id: company.id,
        file_name: file.name,
        status: "parsed",
        processed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (importJobError) {
      throw new Error(`create import job failed: ${importJobError.message}`);
    }

    const rowsToInsert = records.map((record, index) => ({
      import_id: importJob.id,
      row_number: index + 1,
      status: "ok",
      error: null,
      raw: record,
    }));

    const { error: rowsError } = await supabase
      .from("import_rows")
      .insert(rowsToInsert);

    if (rowsError) {
      await supabase.from("import_jobs").delete().eq("id", importJob.id);
      throw new Error(`create import rows failed: ${rowsError.message}`);
    }

    revalidatePath(`/c/${companySlugFromForm}/imports`);
    redirect(`/c/${companySlugFromForm}/imports/${importJob.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Upload import</h1>
          <p className="text-sm text-slate-500">
            Upload CSV for company: {company.name || company.slug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/imports`}
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to imports
        </Link>
      </div>

      <form
        action={uploadImport}
        className="max-w-3xl space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="companySlug" value={companySlug} />

        <div>
          <label
            htmlFor="file"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            CSV file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          This upload creates one import job and one import row per CSV data row.
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Upload CSV
          </button>

          <Link
            href={`/c/${companySlug}/imports`}
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}