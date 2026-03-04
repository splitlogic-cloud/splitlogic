import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(_: Request, { params }: { params: { companySlug: string; id: string } }) {
  try {
    const supabase = await createSupabaseServerClient();
    const company = await requireCompanyBySlugForUser(params.companySlug);

    const { data, error } = await supabase
      .from("statement_lines_v1")
      .select("work_id,party_id,currency,gross_amount,recouped_amount,payable_amount")
      .eq("company_id", company.id)
      .eq("statement_id", params.id)
      .limit(50000);

    if (error) throw new Error(error.message);

    const header = ["work_id", "party_id", "currency", "gross_amount", "recouped_amount", "payable_amount"];
    const lines = [header.join(",")];

    for (const r of data ?? []) {
      lines.push(
        [
          csvEscape(r.work_id),
          csvEscape(r.party_id),
          csvEscape(r.currency),
          csvEscape(r.gross_amount),
          csvEscape(r.recouped_amount),
          csvEscape(r.payable_amount),
        ].join(",")
      );
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="statement-${params.id}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}