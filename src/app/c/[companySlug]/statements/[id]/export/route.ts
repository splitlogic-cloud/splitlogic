import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStatementWithLines } from "@/features/statements/statements.repo";

type Params = {
  params: Promise<{
    companySlug: string;
    id: string;
  }>;
};

function toStr(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function csvEscape(v: unknown) {
  const s = toStr(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_: Request, { params }: Params) {
  const { companySlug, id } = await params;

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

  const { header, lines } = await getStatementWithLines(company.id, id);

  const csvRows: string[] = [];

  csvRows.push(
    [
      "Statement ID",
      "Company",
      "Period Start",
      "Period End",
      "Currency",
      "Party",
      "Status",
      "Total Amount",
    ]
      .map(csvEscape)
      .join(","),
  );

  csvRows.push(
    [
      header.id,
      company.name ?? company.slug ?? "",
      header.period_start,
      header.period_end,
      header.currency,
      header.party_name,
      header.status,
      header.total_amount,
    ]
      .map(csvEscape)
      .join(","),
  );

  csvRows.push("");

  csvRows.push(
    [
      "Line ID",
      "Release",
      "Work",
      "Party",
      "Source Amount",
      "Share %",
      "Allocated Amount",
      "Currency",
      "Note",
      "Created At",
    ]
      .map(csvEscape)
      .join(","),
  );

  for (const line of lines) {
    csvRows.push(
      [
        line.id,
        line.release_title,
        line.work_title,
        line.party_name,
        line.source_amount,
        line.share_percent,
        line.allocated_amount,
        line.currency,
        line.note,
        line.created_at,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const csv = csvRows.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement_${id}.csv"`,
    },
  });
}