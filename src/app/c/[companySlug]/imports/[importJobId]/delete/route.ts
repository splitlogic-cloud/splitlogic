import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ companySlug: string; importJobId: string }>;
  }
) {
  const { companySlug, importJobId } = await context.params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (!company) {
    throw new Error("Company not found");
  }

  await supabase
    .from("import_rows")
    .delete()
    .eq("import_job_id", importJobId);

  await supabase
    .from("import_rows")
    .delete()
    .eq("import_id", importJobId);

  await supabase
    .from("import_jobs")
    .delete()
    .eq("company_id", company.id)
    .eq("id", importJobId);

  return NextResponse.redirect(
    new URL(`/c/${companySlug}/imports`, request.url),
    303
  );
}