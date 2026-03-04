import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const dynamic = "force-dynamic";

export default async function PartiesPage(props: {
  params: Promise<{ companySlug: string }> | { companySlug: string };
  searchParams?: Promise<{ q?: string }> | { q?: string };
}) {
  const params = await Promise.resolve(props.params);
  const searchParams = await Promise.resolve(props.searchParams ?? {});
  const companySlug = params.companySlug;

  const supabase = await createSupabaseServerClient();
  const company = await requireCompanyBySlugForUser(companySlug);

  const q = (searchParams?.q ?? "").trim();

  let query = supabase
    .from("parties")
    .select("id, name, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Parties</h1>
          <p className="text-sm text-slate-500">Artists, labels, publishers, etc.</p>
        </div>

        <form className="flex gap-2" action={`/c/${company.slug}/parties`} method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search party…"
            className="h-9 w-64 rounded-md border px-3 text-sm"
          />
          <button className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white">
            Search
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(data ?? []).map((p: any) => (
          <div key={p.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold">{p.name ?? "Unknown"}</div>
            <div className="mt-1 text-xs text-slate-500 font-mono">{p.id}</div>
          </div>
        ))}

        {(data ?? []).length === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600 shadow-sm md:col-span-3">
            No parties found yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}