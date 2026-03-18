import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";
import {
  getStatementHeader,
  listStatementLines,
} from "@/features/statements/statements.repo";
import { buildStatementPdf } from "@/features/statements/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{
    companySlug: string;
    id: string;
  }>;
};

export async function GET(_req: Request, context: Ctx): Promise<Response> {
  const { companySlug, id } = await context.params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    return new Response("Company not found", { status: 404 });
  }

  const header = await getStatementHeader(company.id, id);

  if (!header) {
    return new Response("Statement not found", { status: 404 });
  }

  const lines = await listStatementLines(company.id, id);

  const pdfBytes = await buildStatementPdf({
    header: {
      statementId: header.id,
      companyName: company.name ?? company.slug ?? companySlug,
      partyName: header.party_name ?? "Unknown party",
      periodStart: header.period_start ?? "",
      periodEnd: header.period_end ?? "",
      currency: header.currency ?? "",
      totalAmount: Number(header.total_amount ?? 0),
      status: header.status ?? "",
      createdAt:
        typeof header.created_at === "string"
          ? header.created_at
          : new Date().toISOString(),
    },
    lines: lines.map((line) => ({
      workTitle: line.work_title ?? "",
      sourceAmount: Number(line.source_amount ?? 0),
      sharePercent: Number(line.share_percent ?? 0),
      allocatedAmount: Number(line.allocated_amount ?? 0),
    })),
  });

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: header.id,
    action: "statement.export.pdf",
    payload: {
      lineCount: lines.length,
    },
  });

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${id}.pdf"`,
    },
  });
}