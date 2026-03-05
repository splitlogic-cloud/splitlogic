import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /c/[companySlug]/masterdata/upload
 *
 * Expected JSON body (flexibel):
 * {
 *   importJobId?: string,
 *   fileName?: string,
 *   storageBucket?: string,
 *   storagePath?: string,
 *   source?: string,
 *   provider?: string,
 *   periodStart?: string,
 *   periodEnd?: string
 * }
 *
 * This endpoint is only responsible for creating/updating an import_jobs row
 * that points to a file already uploaded to storage.
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

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const importJobId = body?.importJobId ? String(body.importJobId) : null;

  // optional metadata
  const file_name = body?.fileName ? String(body.fileName) : null;
  const storage_bucket = body?.storageBucket ? String(body.storageBucket) : null;
  const storage_path = body?.storagePath ? String(body.storagePath) : null;

  const source = body?.source ? String(body.source) : "masterdata";
  const provider = body?.provider ? String(body.provider) : null;

  const period_start = body?.periodStart ? String(body.periodStart) : null;
  const period_end = body?.periodEnd ? String(body.periodEnd) : null;

  // Basic validation
  if (!storage_bucket || !storage_path) {
    return new Response(JSON.stringify({ ok: false, error: "Missing storageBucket/storagePath" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Your DB has import_jobs with company_id + status + created_at, and optional metadata fields.
  // We'll upsert if importJobId provided, else insert new.
  if (importJobId) {
    const { data, error } = await supabaseAdmin
      .from("import_jobs")
      .update({
        company_id: company.id,
        status: "uploaded",
        source,
        provider,
        storage_bucket,
        storage_path,
        file_name,
        period_start,
        period_end,
      } as any)
      .eq("id", importJobId)
      .select("id")
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, importJobId: data?.id ?? importJobId, updated: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const { data, error } = await supabaseAdmin
    .from("import_jobs")
    .insert({
      company_id: company.id,
      status: "uploaded",
      source,
      provider,
      storage_bucket,
      storage_path,
      file_name,
      period_start,
      period_end,
    } as any)
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, importJobId: data?.id, created: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}