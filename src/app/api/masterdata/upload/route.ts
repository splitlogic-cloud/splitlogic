import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * POST /c/[companySlug]/masterdata/upload
 *
 * Accepts multipart/form-data with:
 * - file: File
 *
 * Flow:
 * 1. validate company access
 * 2. upload file to Supabase Storage
 * 3. create import_jobs row
 */
export async function POST(req: Request, context: any): Promise<Response> {
  try {
    const companySlug = String(context?.params?.companySlug ?? "");
    if (!companySlug) {
      return Response.json(
        { ok: false, error: "Missing companySlug" },
        { status: 400 }
      );
    }

    const company = await requireCompanyBySlugForUser(companySlug);

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        { ok: false, error: "Missing file" },
        { status: 400 }
      );
    }

    if (!file.name) {
      return Response.json(
        { ok: false, error: "File must have a name" },
        { status: 400 }
      );
    }

    const bucket = "imports"; // ändra bara denna rad om ditt bucket heter något annat
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${company.id}/masterdata/${Date.now()}-${safeName}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: file.type || "text/csv",
        upsert: false,
      });

    if (uploadError) {
      return Response.json(
        { ok: false, error: `Storage upload failed: ${uploadError.message}` },
        { status: 400 }
      );
    }

    const { data: importJob, error: insertError } = await supabaseAdmin
      .from("import_jobs")
      .insert({
        company_id: company.id,
        status: "uploaded",
        source: "masterdata",
        provider: null,
        storage_bucket: bucket,
        storage_path: storagePath,
        file_name: file.name,
        period_start: null,
        period_end: null,
      } as any)
      .select("id,status,created_at")
      .single();

    if (insertError) {
      return Response.json(
        { ok: false, error: `Create import_job failed: ${insertError.message}` },
        { status: 400 }
      );
    }

    return Response.json(
      {
        ok: true,
        created: true,
        importJobId: importJob.id,
        status: importJob.status,
        storageBucket: bucket,
        storagePath,
        fileName: file.name,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return Response.json(
      { ok: false, error: error?.message || "Unexpected upload error" },
      { status: 500 }
    );
  }
}