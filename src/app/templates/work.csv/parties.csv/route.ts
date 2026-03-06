import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const csv = `external_id,name,ipi
PTY001,Artist Name,123456789
PTY002,Label Name,
`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="parties.csv"',
    },
  });
}