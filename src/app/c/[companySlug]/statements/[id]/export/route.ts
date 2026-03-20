import "server-only";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStatementById } from "@/features/statements/statements.repo";

type RouteContext = {
  params: Promise<{
    companySlug: string;
    id: string;
  }>;
};

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "line_label,work_title,row_count,amount,currency";
  }

  const headers = ["line_label", "work_title", "row_count", "amount", "currency"];

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ];

  return lines.join("\n");
}

export async function GET(_request: Request, context: RouteContext) {
  const { companySlug, id } = await context.params;

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

  const statement = await getStatementById(company.id, id);

  if (!statement) {
    return new NextResponse("Statement not found", { status: 404 });
  }

  const csvRows = statement.lines.map((line) => ({
    line_label: line.line_label ?? "",
    work_title: line.work_title ?? "",
    row_count: line.row_count ?? 0,
    amount: line.amount ?? "",
    currency: line.currency ?? statement.currency ?? "",
  }));

  const csv = buildCsv(csvRows);

  const safePartyName =
    (statement.party_name ?? "statement")
      .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "statement";

  const filename = `${safePartyName}-${id}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}