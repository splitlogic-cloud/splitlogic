import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const csv = `external_id,title,iswc
WRK001,Song Title,T-123.456.789
WRK002,Another Song,
`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="works.csv"',
    },
  });
}