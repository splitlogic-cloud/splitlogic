import { NextResponse } from "next/server";
import { runAllocationV1 } from "@/features/allocations/allocationEngine.repo";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.companyId || !body?.periodStart || !body?.periodEnd) {
    return NextResponse.json(
      { error: "Missing companyId, periodStart, periodEnd" },
      { status: 400 }
    );
  }

  const result = await runAllocationV1({
    companyId: body.companyId,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
  });

  return NextResponse.json({ ok: true, result });
}