import { NextResponse } from "next/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// TODO: koppla till dina riktiga engine calls
async function executeJob(job: any, supabase: any) {
  // job.job_type: import | allocation_run | recoup_run | statement_build
  // job.payload innehåller vad du behöver.
  // Här stoppar du in dina befintliga RPC/engine functions.
  switch (job.job_type) {
    case "allocation_run":
      // await supabase.rpc("run_allocation", { ... })
      return;
    case "recoup_run":
      // await supabase.rpc("run_recoup", { ... })
      return;
    case "statement_build":
      // await supabase.rpc("build_statements", { ... })
      return;
    default:
      return;
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { companySlug: string } }) {
  try {
    const supabase = await createSupabaseServerClient();
    const company = await requireCompanyBySlugForUser(params.companySlug);

    const body = (await req.json().catch(() => ({}))) as { worker_id?: string };
    const workerId = body.worker_id ?? "web-worker";

    // claim
    const { data: job, error: claimErr } = await supabase.rpc("claim_next_engine_job", {
      p_company_id: company.id,
      p_worker_id: workerId,
      p_stuck_minutes: 15,
    });

    if (claimErr) throw new Error(claimErr.message);

    if (!job) {
      return NextResponse.json({ ok: true, job: null });
    }

    try {
      await executeJob(job, supabase);

      const { data: done, error: doneErr } = await supabase.rpc("complete_engine_job", {
        p_company_id: company.id,
        p_job_id: job.id,
        p_status: "succeeded",
        p_error: null,
      });
      if (doneErr) throw new Error(doneErr.message);

      return NextResponse.json({ ok: true, job: done });
    } catch (e: any) {
      const msg = e?.message ?? "Job failed";

      const { data: failed, error: failErr } = await supabase.rpc("complete_engine_job", {
        p_company_id: company.id,
        p_job_id: job.id,
        p_status: "failed",
        p_error: msg,
      });
      if (failErr) throw new Error(failErr.message);

      return NextResponse.json({ ok: false, job: failed, error: msg }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}