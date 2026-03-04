import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companySlug = searchParams.get("companySlug") || "";
  const importId = searchParams.get("importId") || "";
  const after = Number(searchParams.get("after") || "0");
  const limit = Math.min(Number(searchParams.get("limit") || "200"), 500);

  if (!companySlug || !importId) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }

  const supabase = await createClient();
  const company = await requireCompanyBySlugForUser(companySlug);

  // säkerställ att importen tillhör company
  const { data: job } = await supabase
    .from("import_jobs")
    .select("id")
    .eq("id", importId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (!job) return NextResponse.json({ ok: false, error: "import not found" }, { status: 404 });

  const q = supabase
    .from("import_rows")
    .select("id, row_number, status, error, raw")
    .eq("import_id", importId)
    .order("row_number", { ascending: true })
    .limit(limit);

  const { data, error } = after > 0 ? await q.gt("row_number", after) : await q;

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const nextAfter = data?.length ? data[data.length - 1].row_number : null;
  return NextResponse.json({ ok: true, rows: data ?? [], nextAfter });
}