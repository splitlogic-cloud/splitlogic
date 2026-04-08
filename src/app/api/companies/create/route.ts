// src/app/api/companies/create/route.ts
import { NextResponse } from "next/server";
import { createCompanyForUser } from "@/features/companies/companies.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { name?: string } | null;
    const name = body?.name ?? "";
    const company = await createCompanyForUser({ name });
    return NextResponse.json({ ok: true, company });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/companies/create] failed", {
      message,
      error,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}