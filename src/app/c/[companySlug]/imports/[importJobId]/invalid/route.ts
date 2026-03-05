import "server-only";

import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { listImportRows } from "@/features/imports/imports.repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: any
): Promise<Response> {
  const companySlug = String(context?.params?.companySlug ?? "");
  const importJobId = String(context?.params?.importJobId ?? "");

  if (!companySlug || !importJobId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing params" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await requireCompanyBySlugForUser(companySlug);

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "50");

  const res = await listImportRows(importJobId, page, pageSize);
  const rows = (res.rows ?? []).filter((r: any) => r.error != null);

  return new Response(
    JSON.stringify({
      ok: true,
      importId: importJobId,
      page: res.page,
      pageSize: res.pageSize,
      hasNext: typeof res.count === "number" ? res.page * res.pageSize < res.count : rows.length === res.pageSize,
      rows,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}