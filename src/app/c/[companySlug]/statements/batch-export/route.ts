import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listStatementsByCompany, getStatementHeader, listStatementLines } from "@/features/statements/statements.repo";
import { buildStatementPdf } from "@/features/statements/pdf";
import { createAuditEvent } from "@/features/audit/audit.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const companySlug = url.searchParams.get("companySlug") ?? "";
  const status = url.searchParams.get("status") ?? "";

  if (!companySlug) {
    return new Response("Missing companySlug", { status: 400 });
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    return new Response("Company not found", { status: 404 });
  }

  let statements = await listStatementsByCompany(company.id, 500);
  if (status) {
    statements = statements.filter((s) => s.status === status);
  }

  const zip = new JSZip();

  for (const statement of statements) {
    const header = await getStatementHeader(company.id, statement.id);
    if (!header) continue;

    const lines = await listStatementLines(company.id, statement.id);

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

    const base = `statement-${statement.id}`;
    zip.file(`${base}.csv`, csv);
    zip.file(`${base}.pdf`, pdf);
  }

  const content = await zip.generateAsync({ type: "uint8array" });

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement_batch",
    entityId: "batch-export",
    action: "statement.batch_export.zip",
    payload: {
      statementCount: selectedStatements.length,
    },
  });

  const pdfBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  ) as ArrayBuffer;

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${id}.pdf"`,
    },
  });
}