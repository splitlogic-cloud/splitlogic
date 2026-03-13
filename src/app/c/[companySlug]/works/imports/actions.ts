"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  parseCsvText,
  parseWorkImportRows,
  type WorkImportResult,
} from "@/features/works/work-import";

type CompanyRecord = {
  id: string;
  slug: string | null;
  name: string | null;
};

export async function importWorksAction(
  companySlug: string,
  formData: FormData
): Promise<WorkImportResult> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return {
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
      insertedOrUpdated: 0,
      errors: [{ rowNumber: 0, message: "No file uploaded" }],
    };
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,slug,name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`load company failed: ${companyError.message}`);
  }

  if (!company) {
    throw new Error("Company not found");
  }

  const typedCompany = company as CompanyRecord;

  const text = await file.text();
  const rawRows = parseCsvText(text);
  const { parsed, errors } = parseWorkImportRows(rawRows);

  let insertedOrUpdated = 0;

  for (const row of parsed) {
    const { error } = await supabaseAdmin
      .from("works")
      .upsert(
        {
          company_id: typedCompany.id,
          title: row.title,
          isrc: row.isrc,
        },
        {
          onConflict: "company_id,isrc",
        }
      );

    if (error) {
      errors.push({
        rowNumber: row.rowNumber,
        message: error.message,
      });
      continue;
    }

    insertedOrUpdated += 1;
  }

  revalidatePath(`/c/${companySlug}/works`);
  revalidatePath(`/c/${companySlug}/imports`);

  return {
    totalRows: rawRows.length,
    validRows: parsed.length,
    skippedRows: rawRows.length - parsed.length,
    insertedOrUpdated,
    errors,
  };
}

export async function importWorksAndRedirectAction(
  companySlug: string,
  formData: FormData
) {
  const result = await importWorksAction(companySlug, formData);

  const params = new URLSearchParams({
    total: String(result.totalRows),
    valid: String(result.validRows),
    skipped: String(result.skippedRows),
    upserted: String(result.insertedOrUpdated),
    errors: String(result.errors.length),
  });

  redirect(`/c/${companySlug}/works/import?${params.toString()}`);
}