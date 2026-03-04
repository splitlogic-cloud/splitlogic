import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const companyId = String(body.companyId ?? "").trim();
    const importJobId = String(body.importJobId ?? "").trim();

    if (!companyId || !importJobId) {
      return NextResponse.json({ ok: false, error: "missing companyId/importJobId" }, { status: 400 });
    }

    // membership check (company_memberships har ingen id, vi selectar role)
    const m1 = await supabaseAdmin
      .from("company_memberships")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    let membership = !m1.error ? m1.data : null;

    if (!membership) {
      const m2 = await supabaseAdmin
        .from("company_memberships")
        .select("role")
        .eq("company_id", companyId)
        .eq("profile_id", auth.user.id)
        .maybeSingle();

      if (m2.error) throw new Error(m2.error.message);
      membership = m2.data;
    }

    if (!membership) {
      return NextResponse.json({ ok: false, error: "Not a member of this company" }, { status: 403 });
    }

    // load job
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .select("id,status,source,filename,created_at")
      .eq("id", importJobId)
      .eq("company_id", companyId)
      .single();

    if (jobErr) {
      return NextResponse.json({ ok: false, error: jobErr.message }, { status: 500 });
    }

    // load rows (schema-tolerant)
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("import_rows")
      .select("id,row_number,status,error,raw")
      .eq("import_id", importJobId)
      .order("row_number", { ascending: true })
      .limit(2000);

    if (rowsErr) {
      return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, job, rows: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}