import "server-only";

import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /c/[companySlug]/statements/[id]/status
 * Body: { status: "draft" | "sent" | "paid" | "void", note?: string }
 *
 * Updates statement status + timestamps.
 * Assumes statements has: status, sent_at, paid_at, voided_at, note (per your schema screenshot).
 */
export async function POST(req: Request, context: any): Promise<Response> {
  const companySlug = String(context?.params?.companySlug ?? "");
  const statementId = String(context?.params?.id ?? "");

  if (!companySlug || !statementId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing params" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const company = await requireCompanyBySlugForUser(companySlug);

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const nextStatus = String(body?.status ?? "").trim();
  const note = body?.note != null ? String(body.note) : null;

  const allowed = new Set(["draft", "sent", "paid", "void"]);
  if (!allowed.has(nextStatus)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid status" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const now = new Date().toISOString();

  const patch: any = { status: nextStatus };
  if (note !== null) patch.note = note;

  // stamp timestamps
  if (nextStatus === "sent") patch.sent_at = now;
  if (nextStatus === "paid") patch.paid_at = now;
  if (nextStatus === "void") patch.voided_at = now;

  // optional: if reverting to draft, clear stamps
  if (nextStatus === "draft") {
    patch.sent_at = null;
    patch.paid_at = null;
    patch.voided_at = null;
  }

  const { data, error } = await supabaseAdmin
    .from("statements")
    .update(patch)
    .eq("id", statementId)
    .eq("company_id", company.id)
    .select("id,status,sent_at,paid_at,voided_at,note")
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!data?.id) {
    return new Response(JSON.stringify({ ok: false, error: "Statement not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, statement: data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}