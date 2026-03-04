import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

type Params = { companySlug: string };

export default async function Page({ params }: { params: Promise<Params> | Params }) {
  const { companySlug } = await Promise.resolve(params);
  const supabase = await createClient();
  const company = await requireCompanyBySlugForUser(companySlug);

  const { data: jobs, error } = await supabase
    .from("import_jobs")
    .select("id, created_at, status, original_filename")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Imports</h1>
        <Link
          href={`/c/${companySlug}/imports/new`}
          className="rounded-xl px-4 py-2 font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-95"
        >
          Ny import
        </Link>
      </div>

      {error && <div className="text-sm text-rose-600">DB error: {error.message}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left p-3">Datum</th>
              <th className="text-left p-3">Fil</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Öppna</th>
            </tr>
          </thead>
          <tbody>
            {(jobs ?? []).map((j) => (
              <tr key={j.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="p-3">{j.created_at ? new Date(j.created_at).toLocaleString("sv-SE") : "—"}</td>
                <td className="p-3">{j.original_filename ?? "—"}</td>
                <td className="p-3">{String(j.status ?? "—")}</td>
                <td className="p-3">
                  <Link className="text-cyan-700 hover:underline" href={`/c/${companySlug}/imports/${j.id}`}>
                    Visa
                  </Link>
                </td>
              </tr>
            ))}
            {!jobs?.length && (
              <tr>
                <td className="p-3 text-slate-500" colSpan={4}>
                  Inga importer än. Klicka “Ny import”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}