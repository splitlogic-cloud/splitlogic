import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";
import { getStatementHeader, listStatementLines } from "@/features/statements/statements.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{
    companySlug: string;
    statementId: string;
  }>;
};

function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export async function GET(_req: Request, context: Ctx): Promise<Response> {
  const { companySlug, statementId } = await context.params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
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

  const csvRows: string[][] = [
    [
      "statement_id",
      "party_name",
      "status",
      "period_start",
      "period_end",
      "currency",
      "total_amount",
      "work_title",
      "source_amount",
      "share_percent",
      "allocated_amount",
    ],
    ...lines.map((line) => [
      header.id,
      header.party_name ?? "",
      header.status ?? "",
      header.period_start ?? "",
      header.period_end ?? "",
      header.currency ?? "",
      String(header.total_amount ?? 0),
      line.work_title ?? "",
      String(line.source_amount),
      String(line.share_percent),
      String(line.allocated_amount),
    ]),
  ];

  const csv = buildCsv(csvRows);

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: header.id,
    action: "statement.export.csv",
    payload: {
      lineCount: lines.length,
    },
  });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${statementId}.csv"`,
    },
  });
}