import { supabaseAdmin } from "@/lib/supabase/admin";
import { listAuditEventsByCompany } from "@/features/audit/audit.repo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ companySlug: string }>;
};

export default async function AuditPage({ params }: PageProps) {
  const { companySlug } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  const events = await listAuditEventsByCompany({
    companyId: company.id,
    limit: 300,
  });

  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm text-slate-500">Audit</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
          Audit trail
        </h1>
        <div className="mt-2 text-sm text-slate-600">
          {company.name ?? company.slug} · latest events across imports,
          allocations and statements.
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Entity type</th>
              <th className="px-4 py-3 font-medium">Entity id</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Payload</th>
            </tr>
          </thead>
          <tbody>
            {events.length > 0 ? (
              events.map((event) => (
                <tr key={event.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{event.created_at}</td>
                  <td className="px-4 py-3">{event.entity_type}</td>
                  <td className="px-4 py-3 font-mono text-xs">{event.entity_id}</td>
                  <td className="px-4 py-3">{event.action}</td>
                  <td className="px-4 py-3">
                    <pre className="whitespace-pre-wrap text-xs text-slate-600">
                      {JSON.stringify(event.payload ?? {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-500">
                  No audit events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}