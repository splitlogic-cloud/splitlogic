// src/app/api/companies/create/route.ts
import { NextResponse } from "next/server";
import { createCompanyForUser } from "@/features/companies/companies.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { name?: string; orgnr?: string | null } | null;

    const name = (body?.name ?? "").trim();
    const orgnr = body?.orgnr ?? null;

    const company = await createCompanyForUser({ name });

    return NextResponse.json({ ok: true, company });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}