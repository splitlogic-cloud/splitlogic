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
  const headers = [
    "date",
    "title",
    "artist",
    "isrc",
    "platform",
    "territory",
    "amount",
    "currency",
    "units",
    "allocation_line_id",
    "import_row_id",
    "work_id",
    "party_id",
  ];

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
    date: line.transaction_date ?? "",
    title: line.title ?? "",
    artist: line.artist ?? "",
    isrc: line.isrc ?? "",
    platform: line.platform ?? "",
    territory: line.territory ?? "",
    amount: line.amount,
    currency: line.currency ?? statement.currency ?? "",
    units: line.units ?? "",
    allocation_line_id: line.allocation_line_id,
    import_row_id: line.import_row_id,
    work_id: line.work_id ?? "",
    party_id: line.party_id,
  }));

  const csv = buildCsv(csvRows);

  const safePartyName =
    (statement.party_name ?? "statement")
      .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "statement";

  const filename = `${safePartyName}-${id}.csv`;

  const { error: exportStatusError } = await supabaseAdmin
    .from("statements")
    .update({ status: "exported" })
    .eq("id", statement.id)
    .eq("company_id", statement.company_id);

  if (exportStatusError) {
    throw new Error(`Failed to update statement export status: ${exportStatusError.message}`);
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}