import "server-only";

import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /c/[companySlug]/jobs/enqueue/tick
 * Kicks the job runner (one tick). This is typically called by UI or a cron.
 *
 * If you already have an RPC/function for ticking, replace the body with that call.
 */
export async function POST(req: Request, context: any): Promise<Response> {
  const companySlug = String(context?.params?.companySlug ?? "");
  if (!companySlug) {
    return new Response(JSON.stringify({ ok: false, error: "Missing companySlug" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const company = await requireCompanyBySlugForUser(companySlug);

  // Example: mark the oldest queued job as "running" (one tick).
  // Adjust to your schema if needed.
  const { data: job, error: pickErr } = await supabaseAdmin
    .from("engine_jobs")
    .select("id,status")
    .eq("company_id", company.id)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pickErr) {
    return new Response(JSON.stringify({ ok: false, error: pickErr.message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!job?.id) {
    return new Response(JSON.stringify({ ok: true, ticked: false, message: "No queued jobs" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const { error: updErr } = await supabaseAdmin
    .from("engine_jobs")
    .update({ status: "running", started_at: new Date().toISOString() } as any)
    .eq("id", job.id);

  if (updErr) {
    return new Response(JSON.stringify({ ok: false, error: updErr.message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, ticked: true, jobId: job.id }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}