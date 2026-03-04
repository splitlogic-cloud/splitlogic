import { NextResponse } from "next/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { companySlug: string } }) {
  try {
    const supabase = await createSupabaseServerClient();
    const company = await requireCompanyBySlugForUser(params.companySlug);

    const body = (await req.json()) as {
      job_type: string;
      run_key: string;
      entity_type?: string | null;
      entity_id?: string | null;
      payload?: any;
      priority?: number;
    };

    const { data, error } = await supabase.rpc("enqueue_engine_job", {
      p_company_id: company.id,
      p_job_type: body.job_type,
      p_run_key: body.run_key,
      p_entity_type: body.entity_type ?? null,
      p_entity_id: body.entity_id ?? null,
      p_payload: body.payload ?? {},
      p_priority: body.priority ?? 100,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, job: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}