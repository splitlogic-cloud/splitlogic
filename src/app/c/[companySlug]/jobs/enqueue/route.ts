import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ companySlug: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { companySlug } = await params;

  try {
    // const body = await request.json(); // om du behöver body
    // ...DIN LOGIK...
    return NextResponse.json({ ok: true, job: null });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}