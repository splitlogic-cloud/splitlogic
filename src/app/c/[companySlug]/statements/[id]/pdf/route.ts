import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";
import { getStatementHeader, listStatementLines } from "@/features/statements/statements.repo";
import { buildStatementPdf } from "@/features/statements/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{
    companySlug: string;
    statementId: string;
  }>;
};

export async function GET(_req: Request, context: Ctx): Promise<Response> {
  const { companySlug, statementId } = await context.params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    return new Response("Company not found", { status: 404 });
  }

  const header = await getStatementHeader(company.id, statementId);
  if (!header) {
    return new Response("Statement not found", { status: 404 });
  }

  const lines = await listStatementLines(company.id, statementId);

  const bytes = await buildStatementPdf({
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
      sourceAmount: line.sourceAmount ?? line.source_amount,
      sharePercent: line.sharePercent ?? line.share_percent,
      allocatedAmount: line.allocatedAmount ?? line.allocated_amount,
      currency: line.currency ?? null,
    })),
  });

  await supabaseAdmin
    .from("statements")
    .update({
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", header.id)
    .eq("company_id", company.id);

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: header.id,
    action: "statement.export.pdf",
    payload: {
      lineCount: lines.length,
    },
  });

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${statementId}.pdf"`,
    },
  });
}