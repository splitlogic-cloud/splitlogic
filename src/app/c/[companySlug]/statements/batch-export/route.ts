import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  listStatementsByCompany,
  getStatementHeader,
  listStatementLines,
} from "@/features/statements/statements.repo";
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
        String(line.source_amount ?? 0),
        String(line.share_percent ?? 0),
        String(line.allocated_amount ?? 0),
      ]),
    ];

    const csv = buildCsv(csvRows);

    const pdfBytes = await buildStatementPdf({
      header: {
        statementId: header.id,
        companyName: company.name ?? company.slug ?? "Company",
        partyName: header.party_name ?? "Unnamed party",
        periodStart: header.period_start ?? "",
        periodEnd: header.period_end ?? "",
        currency: header.currency ?? "",
        totalAmount: Number(header.total_amount ?? 0),
        status: header.status ?? "",
        createdAt: header.created_at ?? new Date().toISOString(),
      },
      lines: lines.map((line) => ({
        workTitle: line.work_title ?? "",
        sourceAmount: Number(line.source_amount ?? 0),
        sharePercent: Number(line.share_percent ?? 0),
        allocatedAmount: Number(line.allocated_amount ?? 0),
        currency: line.currency ?? header.currency ?? "",
      })),
    });

    const base = `statement-${statement.id}`;
    zip.file(`${base}.csv`, csv);
    zip.file(`${base}.pdf`, pdfBytes);
  }

  const content = await zip.generateAsync({ type: "uint8array" });

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement_batch",
    entityId: "batch-export",
    action: "statement.batch_export.zip",
    payload: {
      statementCount: statements.length,
      statusFilter: status || null,
    },
  });

  const zipBuffer = content.buffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength
  ) as ArrayBuffer;

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="statements-batch-export.zip"',
    },
  });
}