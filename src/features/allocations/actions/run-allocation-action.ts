"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAllocation } from "../run-allocation";

export async function runAllocationAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  // ✅ Hämta companyId från companySlug
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error(`Company not found: ${companyError?.message ?? ""}`);
  }

  const companyId = company.id;

  // ✅ Kör allocation med korrekt objekt
  const result = await runAllocation({
    companyId,
    importJobId,
  });

  // ✅ Revalidate paths
  revalidatePath(`/c/${companySlug}/imports`);
  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
  revalidatePath(`/c/${companySlug}/statements`);

  return result;
}