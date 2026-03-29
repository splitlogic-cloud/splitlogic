import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companySlug, importJobId, rowId, workId } = body;

    if (!companySlug || !importJobId || !rowId || !workId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // Hämta company_id från slug
    const { data: companyData, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("slug", companySlug)
      .single();

    if (companyError || !companyData) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const companyId = companyData.id;

    // Säkerställ att row finns och är needs_review
    const { data: rowData, error: rowError } = await supabaseAdmin
      .from("import_rows")
      .select("id,status,company_id,import_job_id")
      .eq("id", rowId)
      .single();

    if (rowError || !rowData) {
      return NextResponse.json({ error: "Import row not found" }, { status: 404 });
    }

    if (rowData.status !== "needs_review") {
      return NextResponse.json({ error: "Row is not in needs_review state" }, { status: 409 });
    }

    if (rowData.company_id !== companyId || rowData.import_job_id !== importJobId) {
      return NextResponse.json({ error: "Row does not belong to this company/importJob" }, { status: 403 });
    }

    // Uppdatera raden
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("import_rows")
      .update({
        status: "matched",
        matched_work_id: workId,
        work_id: workId,
        match_source: "manual",
        match_confidence: 1,
        allocation_status: "pending",
        updated_at: now,
      })
      .eq("id", rowId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Logga i audit
    await supabaseAdmin.from("manual_match_audit").insert({
      import_row_id: rowId,
      work_id: workId,
      import_job_id: importJobId,
      company_id: companyId,
      created_at: now,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}