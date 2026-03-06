// src/app/c/[companySlug]/log/page.tsx
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AuditLogPage(props: { params: Promise<{ companySlug: string }> | Promise<{ companySlug: string }> }) {
  const params = await Promise.resolve(props.params);
  const companySlug = params.companySlug;

  const company = await requireCompanyBySlugForUser(companySlug);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("id,action,entity_type,entity_id,created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`load audit_log failed: ${error.message}`);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-slate-500">System events for this company.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-500 border-b border-slate-100">
          <div className="col-span-4">Action</div>
          <div className="col-span-3">Entity</div>
          <div className="col-span-3">Entity ID</div>
          <div className="col-span-2">Time</div>
        </div>

        <div className="divide-y divide-slate-100">
          {(data ?? []).map((e: any) => (
            <div key={e.id} className="grid grid-cols-12 gap-3 px-4 py-3 text-sm">
              <div className="col-span-4 font-medium">{e.action}</div>
              <div className="col-span-3 text-slate-700">{e.entity_type ?? "—"}</div>
              <div className="col-span-3 text-slate-500 truncate">{e.entity_id ?? "—"}</div>
              <div className="col-span-2 text-slate-500">{String(e.created_at ?? "").slice(0, 19).replace("T", " ")}</div>
            </div>
          ))}
          {(data ?? []).length === 0 && <div className="p-6 text-sm text-slate-500">No events.</div>}
        </div>
      </div>
    </div>
  );
}