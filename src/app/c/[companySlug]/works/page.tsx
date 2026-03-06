import "server-only";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorksPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const { data: works, error } = await supabase
    .from("works")
    .select("id,title,external_id,created_at,updated_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`load works failed: ${error.message}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Works</h1>
        <p className="text-sm text-slate-500">
          Catalog works for company: {companySlug}
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Title</div>
          <div>External ID</div>
          <div>Created</div>
        </div>

        {!works || works.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">No works yet.</div>
        ) : (
          works.map((work) => (
            <div
              key={work.id}
              className="grid grid-cols-[1.5fr_1fr_1fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
            >
              <div className="font-medium text-slate-900">
                {work.title || "Untitled work"}
              </div>
              <div className="text-sm text-slate-600">
                {work.external_id || "—"}
              </div>
              <div className="text-sm text-slate-600">
                {work.created_at
                  ? new Date(work.created_at).toISOString().slice(0, 10)
                  : "—"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}