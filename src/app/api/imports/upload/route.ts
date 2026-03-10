// src/app/api/imports/upload/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processImportJob } from "@/features/imports/imports.processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportSource = "revenue" | "masterdata";

function normalizeSource(input: string | null): ImportSource {
  const v = (input ?? "").trim().toLowerCase();
  if (v === "revenue" || v.includes("revenue") || v.includes("royalty")) return "revenue";
  if (v === "masterdata" || v.includes("masterdata") || v.includes("works") || v.includes("parties"))
    return "masterdata";
  return "revenue";
}

function safeFilename(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_").replace(/\s+/g, "_").slice(0, 180);
}

/**
 * Verifierar att auth-user är medlem i bolaget.
 * Din company_memberships saknar "id" => vi SELECTar bara "role".
 * Vi testar både user_id och profile_id (beroende på hur din tabell är byggd).
 */
async function requireMembership(companyId: string, authUserId: string) {
  // 1) Försök med user_id
  const byUserId = await supabaseAdmin
    .from("company_memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", authUserId)
    .maybeSingle();

  if (!byUserId.error) return byUserId.data;

  const msg = String(byUserId.error.message || "");
  const looksLikeMissingColumn =
    msg.includes("Could not find the") || msg.includes("schema cache") || msg.includes("column");

  // Om det inte är “missing column” är det ett riktigt fel som vi ska bubbla upp
  if (!looksLikeMissingColumn) {
    throw new Error(byUserId.error.message);
  }

  // 2) Fallback: profile_id
  const byProfileId = await supabaseAdmin
    .from("company_memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("profile_id", authUserId)
    .maybeSingle();

  if (byProfileId.error) throw new Error(byProfileId.error.message);
  return byProfileId.data;
}

export async function POST(req: Request) {
  const bucket = "imports"; // måste finnas i Supabase Storage

  try {
    // 0) Auth via user-session
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();

    if (authErr || !auth?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const form = await req.formData();
    const companySlug = String(form.get("companySlug") ?? "").trim();
    const source = normalizeSource(String(form.get("source") ?? form.get("type") ?? ""));
    const file = form.get("file") as File | null;

    if (!companySlug) {
      return NextResponse.json({ ok: false, error: "Missing companySlug" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }

    // 1) Slug -> company
    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .select("id, slug")
      .eq("slug", companySlug)
      .single();

    if (companyErr || !company?.id) {
      return NextResponse.json(
        { ok: false, error: companyErr?.message ?? "Company not found" },
        { status: 404 }
      );
    }

    // 2) Membership-check (innan vi bypassar RLS)
    const membership = await requireMembership(company.id, auth.user.id);
    if (!membership) {
      return NextResponse.json({ ok: false, error: "Not a member of this company" }, { status: 403 });
    }

    // 3) Skapa import_job (admin)
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .insert({
        company_id: company.id,
        source,
        status: "uploaded",
        filename: file.name,
        mime_type: file.type || "text/csv",
        byte_size: file.size,
        storage_bucket: bucket, // NOT NULL hos dig
        storage_path: "pending", // NOT NULL-safe
      })
      .select("id, company_id")
      .single();

    if (jobErr || !job?.id) {
      return NextResponse.json(
        { ok: false, error: jobErr?.message ?? "Failed to create import job" },
        { status: 500 }
      );
    }

    // 4) Upload till Storage (admin)
    const path = `${company.id}/${job.id}/${safeFilename(file.name)}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type || "text/csv", upsert: true });

    if (uploadErr) {
      await supabaseAdmin.from("import_jobs").update({ status: "failed" }).eq("id", job.id);
      return NextResponse.json({ ok: false, error: uploadErr.message }, { status: 500 });
    }

    // 5) Uppdatera storage_path
    const { error: updErr } = await supabaseAdmin
      .from("import_jobs")
      .update({ storage_bucket: bucket, storage_path: path })
      .eq("id", job.id);

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: `Uploaded but failed to update job: ${updErr.message}` },
        { status: 500 }
      );
    }

    const processing = await processImportJob(job.id);

    return NextResponse.json({
      ok: true,
      importJobId: job.id,
      companyId: company.id,
      source,
      role: membership.role ?? null,
      storage: { bucket, path },
      processing,
    });
}