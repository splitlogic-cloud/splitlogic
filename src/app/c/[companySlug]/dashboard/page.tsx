import "server-only";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

  const warnings = [
    importsCountRes.error ? `Imports: ${importsCountRes.error.message}` : null,
    worksCountRes.error ? `Works: ${worksCountRes.error.message}` : null,
    partiesCountRes.error ? `Parties: ${partiesCountRes.error.message}` : null,
    statementsCountRes.error ? `Statements: ${statementsCountRes.error.message}` : null,
    latestImportRes.error ? `Latest import: ${latestImportRes.error.message}` : null,
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