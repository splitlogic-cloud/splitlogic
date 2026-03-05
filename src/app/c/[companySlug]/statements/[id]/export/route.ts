import "server-only";

import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /c/[companySlug]/statements/[id]/export
 *
 * Returns CSV (text/csv) built from statement_lines_v1 view.
 * Your view columns include: company_id, work_id, work_title, party_id, party_name, currency, earned_net, ...
 */
export async function GET(req: Request, context: any): Promise<Response> {
  const companySlug = String(context?.params?.companySlug ?? "");
  const statementId = String(context?.params?.id ?? "");

  if (!companySlug || !statementId) {
    return new Response("Missing params", { status: 400 });
  }

  const company = await requireCompanyBySlugForUser(companySlug);
  const supabase = await createSupabaseServerClient();

  // Pull statement lines from view
  const { data, error } = await supabase
    .from("statement_lines_v1")
    .select("work_title,party_name,currency,earned_net,work_id,party_id")
    .eq("company_id", company.id)
    .eq("statement_id", statementId)
    .order("party_name", { ascending: true })
    .order("work_title", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = (data ?? []) as any[];

  // CSV helpers (simple, safe escaping)
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = ["party_name", "work_title", "currency", "earned_net"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [esc(r.party_name), esc(r.work_title), esc(r.currency), esc(r.earned_net)].join(",")
    ),
  ];

  const csv = lines.join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="statement-${statementId}.csv"`,
      "cache-control": "no-store",
    },
  });
}