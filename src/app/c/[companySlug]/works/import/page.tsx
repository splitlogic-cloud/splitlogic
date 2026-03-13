import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { importWorksAndRedirectAction } from "./actions";

export const dynamic = "force-dynamic";

type CompanyRecord = {
  id: string;
  slug: string | null;
  name: string | null;
};

function toSafeNumber(value: string | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export default async function WorkImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams?: Promise<{
    total?: string;
    valid?: string;
    skipped?: string;
    upserted?: string;
    errors?: string;
    firstError?: string;
  }>;
}) {
  const { companySlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,slug,name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`load company failed: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const typedCompany = company as CompanyRecord;

  const total = toSafeNumber(resolvedSearchParams?.total);
  const valid = toSafeNumber(resolvedSearchParams?.valid);
  const skipped = toSafeNumber(resolvedSearchParams?.skipped);
  const upserted = toSafeNumber(resolvedSearchParams?.upserted);
  const errorCount = toSafeNumber(resolvedSearchParams?.errors);
  const firstError = resolvedSearchParams?.firstError ?? "";

  const hasSummary =
    total > 0 || valid > 0 || skipped > 0 || upserted > 0 || errorCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Import works</h1>
          <p className="text-sm text-slate-500">
            Upload a catalog CSV for company: {typedCompany.name || typedCompany.slug}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/c/${companySlug}/imports`}
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to imports
          </Link>

          <Link
            href={`/c/${companySlug}/works`}
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to works
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">CSV format</h2>
          <p className="text-sm text-slate-600">
            Required columns: <span className="font-medium">isrc</span> and{" "}
            <span className="font-medium">title</span>.
          </p>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <pre className="whitespace-pre-wrap font-mono">
{`isrc,title
GBKPL1942020,Jag Räcker
GBKPL1942019,Another Track`}
            </pre>
          </div>
        </div>
      </div>

      {hasSummary ? (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Total rows</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{total}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Valid rows</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{valid}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Skipped rows</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{skipped}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Inserted / updated</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{upserted}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Errors</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{errorCount}</div>
          </div>
        </div>
      ) : null}

      {firstError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <div className="text-sm font-medium text-red-800">First error</div>
          <div className="mt-2 break-words text-sm text-red-700">{firstError}</div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <form
          action={importWorksAndRedirectAction.bind(null, companySlug)}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="file"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Work catalog CSV
            </label>

            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </div>

          <button
            type="submit"
            className="inline-flex rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Import works
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Next step</h2>
        <p className="mt-2 text-sm text-slate-600">
          After importing your catalog, go back to the import review page and run
          work matching again.
        </p>
      </div>
    </div>
  );
}