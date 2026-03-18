import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";
import { getStatementHeader, listStatementLines } from "@/features/statements/statements.repo";
import { buildStatementPdf } from "@/features/statements/pdf";
import { sendStatementEmail } from "@/features/statements/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{
    companySlug: string;
    statementId: string;
  }>;
};

function buildHtml(params: {
  companyName: string;
  partyName: string;
  totalAmount: number;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}) {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px 0;">Royalty Statement</h2>
      <p style="margin: 0 0 12px 0;">Hello,</p>
      <p style="margin: 0 0 12px 0;">
        Please find attached your royalty statement from <strong>${params.companyName}</strong>.
      </p>
      <ul style="margin: 0 0 12px 18px;">
        <li>Party: ${params.partyName}</li>
        <li>Period: ${params.periodStart ?? "—"} → ${params.periodEnd ?? "—"}</li>
        <li>Total: ${params.totalAmount.toFixed(2)} ${params.currency ?? "SEK"}</li>
      </ul>
      <p style="margin: 0;">Best regards,<br/>${params.companyName}</p>
    </div>
  `;
}

function buildText(params: {
  companyName: string;
  partyName: string;
  totalAmount: number;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}) {
  return [
    "Royalty Statement",
    "",
    `Company: ${params.companyName}`,
    `Party: ${params.partyName}`,
    `Period: ${params.periodStart ?? "—"} → ${params.periodEnd ?? "—"}`,
    `Total: ${params.totalAmount.toFixed(2)} ${params.currency ?? "SEK"}`,
    "",
    `Regards,`,
    params.companyName,
  ].join("\n");
}

export async function POST(req: Request, context: Ctx): Promise<Response> {
  const { companySlug, statementId } = await context.params;
  const body = (await req.json()) as {
    sentTo?: string | null;
    sentBy?: string | null;
  };

  const sentTo = String(body.sentTo ?? "").trim();
  const sentBy = String(body.sentBy ?? "").trim() || null;

  if (!sentTo) {
    return Response.json({ error: "Missing recipient email" }, { status: 400 });
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    return Response.json({ error: "Company not found" }, { status: 404 });
  }

  const header = await getStatementHeader(company.id, statementId);
  if (!header) {
    return Response.json({ error: "Statement not found" }, { status: 404 });
  }

  const lines = await listStatementLines(company.id, statementId);

  const pdf = await buildStatementPdf({
    header: {
      statementId: header.id,
      companyName: company.name ?? company.slug ?? "Company",
      partyName: header.party_name ?? "Unnamed party",
      periodStart: header.period_start ?? null,
      periodEnd: header.period_end ?? null,
      currency: header.currency ?? null,
      totalAmount: header.total_amount ?? 0,
      status: header.status ?? null,
      createdAt: header.created_at ?? null,
    },
    lines: lines.map((line) => ({
      workTitle: line.work_title ?? null,
      sourceAmount: line.source_amount,
      sharePercent: line.share_percent,
      allocatedAmount: line.allocated_amount,
      currency: line.currency ?? null,
    })),
  });

  const subject = `Royalty Statement ${header.period_start ?? ""} ${header.period_end ? `- ${header.period_end}` : ""}`.trim();

  await sendStatementEmail({
    to: sentTo,
    subject,
    text: buildText({
      companyName: company.name ?? company.slug ?? "Company",
      partyName: header.party_name ?? "Unnamed party",
      totalAmount: header.total_amount ?? 0,
      currency: header.currency ?? null,
      periodStart: header.period_start ?? null,
      periodEnd: header.period_end ?? null,
    }),
    html: buildHtml({
      companyName: company.name ?? company.slug ?? "Company",
      partyName: header.party_name ?? "Unnamed party",
      totalAmount: header.total_amount ?? 0,
      currency: header.currency ?? null,
      periodStart: header.period_start ?? null,
      periodEnd: header.period_end ?? null,
    }),
    attachments: [
      {
        filename: `statement-${statementId}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  const sentAt = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("statements")
    .update({
      status: "sent",
      sent_at: sentAt,
      sent_to: sentTo,
      sent_by: sentBy,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", statementId)
    .eq("company_id", company.id);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: statementId,
    action: "statement.sent.email",
    payload: {
      sentTo,
      sentBy,
      lineCount: lines.length,
    },
  });

  return Response.json({ ok: true });
}
