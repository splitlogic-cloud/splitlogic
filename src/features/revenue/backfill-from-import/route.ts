import { NextResponse } from "next/server";
import { backfillRevenueRowsFromImport } from "@/features/revenue/backfillFromImport.repo";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body?.companyId || !body?.importId || !body?.sourceSystem) {
    return NextResponse.json(
      { error: "Missing companyId, importId, sourceSystem" },
      { status: 400 }
    );
  }

  const result = await backfillRevenueRowsFromImport({
    companyId: body.companyId,
    importId: body.importId,
    sourceSystem: body.sourceSystem,
  });

  return NextResponse.json({ ok: true, result });
}