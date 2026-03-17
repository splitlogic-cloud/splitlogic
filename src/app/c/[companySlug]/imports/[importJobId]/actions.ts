"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

type VerifyContextResult =
  | {
      ok: true;
      companyId: string;
      importId: string;
    }
  | {
      ok: false;
      message: string;
    };

async function verifyContext(
  companySlug: string,
  importJobId: string
): Promise<VerifyContextResult> {
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    return { ok: false, message: "Company not found" };
  }

  const { data: importJob, error: importError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (importError || !importJob) {
    return { ok: false, message: "Import job not found for company" };
  }

  return {
    ok: true,
    companyId: company.id,
    importId: importJob.id,
  };
}

export async function manualMatchImportRowAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");
  const rowId = String(formData.get("rowId") ?? "");
  const workId = String(formData.get("workId") ?? "");

  if (!companySlug || !importJobId || !rowId || !workId) {
    throw new Error("Missing required fields for manual match");
  }

  const ctx = await verifyContext(companySlug, importJobId);
  if (!ctx.ok) {
    throw new Error(ctx.message);
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from("import_rows")
    .select("id, import_id")
    .eq("id", rowId)
    .eq("import_id", ctx.importId)
    .maybeSingle();

  if (rowError || !row) {
    throw new Error("Import row not found for import");
  }

  const { data: work, error: workError } = await supabaseAdmin
    .from("works")
    .select("id, company_id")
    .eq("id", workId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();

  if (workError || !work) {
    throw new Error("Work not found for company");
  }

  const { error: updateError } = await supabaseAdmin
    .from("import_rows")
    .update({
      matched_work_id: work.id,
      match_source: "manual",
      match_confidence: 1,
    })
    .eq("id", row.id);

  if (updateError) {
    throw new Error(`Failed to save manual match: ${updateError.message}`);
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}

export async function clearImportRowMatchAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");
  const rowId = String(formData.get("rowId") ?? "");

  if (!companySlug || !importJobId || !rowId) {
    throw new Error("Missing required fields for clear match");
  }

  const ctx = await verifyContext(companySlug, importJobId);
  if (!ctx.ok) {
    throw new Error(ctx.message);
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from("import_rows")
    .select("id, import_id")
    .eq("id", rowId)
    .eq("import_id", ctx.importId)
    .maybeSingle();

  if (rowError || !row) {
    throw new Error("Import row not found for import");
  }

  const { error: updateError } = await supabaseAdmin
    .from("import_rows")
    .update({
      matched_work_id: null,
      match_source: null,
      match_confidence: null,
    })
    .eq("id", row.id);

  if (updateError) {
    throw new Error(`Failed to clear match: ${updateError.message}`);
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}