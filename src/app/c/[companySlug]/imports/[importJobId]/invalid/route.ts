import "server-only";
import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { listImportRowsByJobAdmin } from "@/features/imports/imports.repo";

type Ctx = {
  params: Promise<{
    companySlug: string;
    importJobId: string;
  }>;
};

export async function GET(_req: Request, ctx: Ctx) {
  const { companySlug, importJobId } = await ctx.params;

  // 1️⃣ Membership
  const companyData = await requireCompanyBySlugForUser(companySlug);
  if (!companyData?.id) notFound();

  // 2️⃣ Fetch invalid rows
  const rows = await listImportRowsByJobAdmin({
    companyId: companyData.id,
    importJobId,
    onlyInvalid: true,
    limit: 10000,
    offset: 0,
  });

  // 3️⃣ Build CSV
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    const needsQuotes = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const header = ["row_number", "error", "warnings", "raw"].join(",");

  const lines = [
    header,
    ...rows.map((r: any) =>
      [
        escape(r.row_number),
        escape(r.error),
        escape(r.warnings),
        escape(r.raw),
      ].join(",")
    ),
  ];

  const csv = lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invalid-${importJobId}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}