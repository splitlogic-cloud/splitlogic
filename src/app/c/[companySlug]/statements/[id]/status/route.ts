import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{
    companySlug: string;
    statementId: string;
  }>;
};

export async function POST(req: Request, context: Ctx): Promise<Response> {
  const { companySlug, statementId } = await context.params;
  const body = (await req.json()) as { status?: string };

  const nextStatus = String(body.status ?? "");

  if (!["draft", "sent", "paid", "void"].includes(nextStatus)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    return Response.json({ error: "Company not found" }, { status: 404 });
  }

  const { data: statement, error: statementError } = await supabaseAdmin
    .from("statements")
    .select("id, status")
    .eq("company_id", company.id)
    .eq("id", statementId)
    .maybeSingle();

  if (statementError || !statement) {
    return Response.json({ error: "Statement not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {
    status: nextStatus,
  };

  if (nextStatus === "sent") patch.sent_at = new Date().toISOString();
  if (nextStatus === "paid") patch.paid_at = new Date().toISOString();
  if (nextStatus === "void") patch.voided_at = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("statements")
    .update(patch)
    .eq("id", statementId)
    .eq("company_id", company.id);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: statementId,
    action: `statement.status.${nextStatus}`,
    payload: {
      previousStatus: statement.status,
      nextStatus,
    },
  });

  return Response.json({ ok: true });
}