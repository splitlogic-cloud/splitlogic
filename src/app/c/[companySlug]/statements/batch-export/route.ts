import "server-only";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listStatementsByCompany } from "@/features/statements/statements.repo";

type RouteContext = {
  params: Promise<{
    companySlug: string;
  }>;
};

function asCsvValue(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return [
      [
        "statement_id",
        "party_name",
        "period_start",
        "period_end",
        "status",
        "currency",
        "total_amount",
        "created_at",
      ].join(","),
    ].join("\n");
  }

  const headers = [
    "statement_id",
    "party_name",
    "period_start",
    "period_end",
    "status",
    "currency",
    "total_amount",
    "created_at",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => asCsvValue(row[header])).join(",")
    ),
  ];

  return lines.join("\n");
}

export async function GET(request: Request, context: RouteContext) {
  const { companySlug } = await context.params;
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status");
  const limitParam = searchParams.get("limit");
  const limit =
    limitParam && Number.isFinite(Number(limitParam))
      ? Math.max(1, Math.min(5000, Number(limitParam)))
      : 500;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    return new NextResponse("Company not found", { status: 404 });
  }

  let statements = await listStatementsByCompany(company.id);

  if (status) {
    statements = statements.filter((statement) => statement.status === status);
  }

  statements = statements.slice(0, limit);

  const csvRows = statements.map((statement) => ({
    statement_id: statement.id,
    statement_run_id: statement.statement_run_id,
    party_name: statement.party_name ?? "",
    period_start: statement.period_start ?? "",
    period_end: statement.period_end ?? "",
    status: statement.status,
    currency: statement.currency,
    total_amount: statement.total_amount,
    line_count: statement.line_count,
    run_status: statement.run_status ?? "",
    created_at: statement.created_at ?? "",
  }));

  const csv = buildCsv(csvRows);
  const filename = `statements-${companySlug}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}