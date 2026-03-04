import "server-only";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const dynamic = "force-dynamic";

export default async function WorksPage(props: {
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
    .from("works")
    .select("id, title, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Works</h1>
          <p className="text-sm text-slate-500">Tracks / works in this company</p>
        </div>

        <form className="flex gap-2" action={`/c/${company.slug}/works`} method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search title…"
            className="h-9 w-64 rounded-md border px-3 text-sm"
          />
          <button className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white">
            Search
          </button>
        </form>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Title</th>
              <th className="text-right px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data ?? []).map((w: any) => (
              <tr key={w.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{w.title ?? "Untitled"}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">
                  {w.created_at ? new Date(w.created_at).toLocaleDateString("sv-SE") : "—"}
                </td>
              </tr>
            ))}

            {(data ?? []).length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-sm text-slate-600" colSpan={2}>
                  No works found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">
        <Link className="hover:underline" href={`/c/${company.slug}/imports`}>
          Go to Imports
        </Link>
      </div>
    </div>
  );
}