import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const dynamic = "force-dynamic";

function badge(action: string) {
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";
  if (action.includes("LOCK")) return `${base} bg-amber-50 border-amber-200 text-amber-700`;
  if (action.includes("SENT")) return `${base} bg-sky-50 border-sky-200 text-sky-700`;
  if (action.includes("PAID")) return `${base} bg-emerald-50 border-emerald-200 text-emerald-700`;
  if (action.includes("FAILED")) return `${base} bg-rose-50 border-rose-200 text-rose-700`;
  return `${base} bg-slate-50 border-slate-200 text-slate-700`;
}

export default async function AuditPage(props: {
  params: Promise<{ companySlug: string }> | { companySlug: string };
}) {
  const params = await Promise.resolve(props.params);
  const companySlug = params.companySlug;

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
                <td className="px-4 py-2">
                  <span className={badge(e.action)}>{e.action}</span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-700">
                  {e.entity_type}
                  {e.entity_id ? <span className="text-slate-400"> · {String(e.entity_id).slice(0, 8)}</span> : null}
                </td>
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