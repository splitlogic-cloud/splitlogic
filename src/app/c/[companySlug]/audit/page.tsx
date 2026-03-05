import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AuditPage(props: {
  params: Promise<{ companySlug: string }> | { companySlug: string };
}) {
  const params = await Promise.resolve(props.params);
  const companySlug = params.companySlug;

  if (!companySlug) throw new Error("Missing companySlug param");

  const supabase = await createSupabaseServerClient();
  const company = await requireCompanyBySlugForUser(companySlug);

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, ref, source, actor_user_id, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-slate-500">Immutable, append-only event log</p>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">When</th>
              <th className="text-left px-4 py-2 font-medium">Action</th>
              <th className="text-left px-4 py-2 font-medium">Entity</th>
              <th className="text-left px-4 py-2 font-medium">Ref</th>
              <th className="text-right px-4 py-2 font-medium">Actor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data ?? []).map((e: any) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-xs text-slate-600">
                  {e.created_at ? new Date(e.created_at).toLocaleString("sv-SE") : "—"}
                </td>
                <td className="px-4 py-2">{e.action}</td>
                <td className="px-4 py-2 text-xs text-slate-700">{e.entity_type}</td>
                <td className="px-4 py-2 text-xs text-slate-700">{e.ref ?? "—"}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-500 font-mono">
                  {e.actor_user_id ? String(e.actor_user_id).slice(0, 8) : "system"}
                </td>
              </tr>
            ))}

            {(data ?? []).length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-sm text-slate-600" colSpan={5}>
                  No audit events yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}