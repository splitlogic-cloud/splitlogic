import { NextResponse } from "next/server";
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

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;

  const { header, lines } = await getStatementWithLines(id);

  const csvRows: string[] = [];

  // Header row
  csvRows.push([
    "Statement ID",
    "Period Start",
    "Period End",
    "Currency",
  ].join(","));

  csvRows.push([
    toStr(header.id),
    toStr(header.period_start),
    toStr(header.period_end),
    toStr(header.currency),
  ].join(","));

  csvRows.push(""); // empty line

  // Line headers
  csvRows.push([
    "Release",
    "Work",
    "Source Amount",
    "Share %",
    "Allocated Amount",
  ].join(","));

  for (const line of lines) {
    csvRows.push([
      toStr(line.release_title),
      toStr(line.work_title),
      toStr(line.source_amount),     // ✅ FIXED
      toStr(line.share_percent),
      toStr(line.allocated_amount),
    ].join(","));
  }

  const csv = csvRows.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="statement_${id}.csv"`,
    },
  });
}