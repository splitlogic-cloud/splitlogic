import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{
    companySlug: string;
    id: string;
  }>;
};

export async function POST(req: Request, context: Ctx): Promise<Response> {
  const { companySlug, id } = await context.params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    return new Response("Company not found", { status: 404 });
  }

  const { data: statement, error: statementError } = await supabaseAdmin
    .from("statements")
    .select("id, company_id, status, party_id, note")
    .eq("id", id)
    .eq("company_id", company.id)
    .maybeSingle();

  if (statementError || !statement) {
    return new Response("Statement not found", { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const recipientEmail =
    typeof body.recipientEmail === "string" ? body.recipientEmail.trim() : "";
  const subject =
    typeof body.subject === "string" ? body.subject.trim() : "";
  const message =
    typeof body.message === "string" ? body.message.trim() : "";

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: statement.id,
    action: "statement.send.requested",
    payload: {
      recipientEmail: recipientEmail || null,
      subject: subject || null,
      message: message || null,
    },
  });

  const { error: updateError } = await supabaseAdmin
    .from("statements")
    .update({
      status: statement.status === "paid" ? statement.status : "sent",
      sent_at: new Date().toISOString(),
      send_metadata: {
        recipientEmail: recipientEmail || null,
        subject: subject || null,
        message: message || null,
      },
    })
    .eq("id", statement.id)
    .eq("company_id", company.id);

  if (updateError) {
    return new Response(`Failed to update statement: ${updateError.message}`, {
      status: 500,
    });
  }

  return Response.json({
    ok: true,
    statementId: statement.id,
  });
}