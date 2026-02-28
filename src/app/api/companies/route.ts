import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Next 15: params is Promise
type Ctx = { params: Promise<{ id: string }> };

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(_req: Request, ctx: Ctx) {
  const p = await ctx.params;
  return NextResponse.json({ ok: true, params: p });
}

export async function POST(_req: Request, ctx: Ctx) {
  const p = await ctx.params;
  const importJobId = (p?.id ?? "").trim();

  return NextResponse.json({
    ok: true,
    importJobId,
    isUuid: isUuid(importJobId),
    rawParams: p,
  });
}