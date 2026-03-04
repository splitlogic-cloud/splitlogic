import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { companySlug: string; id: string } }) {
  try {
    const supabase = await createSupabaseServerClient();
    const company = await requireCompanyBySlugForUser(params.companySlug);

    const body = (await req.json().catch(() => null)) as { status?: string } | null;
    const status = body?.status;

    if (!status || !["sent", "paid", "void"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }

    const patch: Record<string, any> = { status };
    if (status === "sent") patch.sent_at = new Date().toISOString();
    if (status === "paid") patch.paid_at = new Date().toISOString();
    if (status === "void") patch.voided_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("statements")
      .update(patch)
      .eq("company_id", company.id)
      .eq("id", params.id)
      .select("id,status,sent_at,paid_at,voided_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, statement: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}