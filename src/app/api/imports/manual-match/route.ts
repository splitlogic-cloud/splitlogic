import { NextResponse } from "next/server";
import { manualMatchImportRowAction } from "@/app/c/[companySlug]/imports/[importJobId]/actions";

type Body = {
  companySlug?: string;
  importJobId?: string;
  rowId?: string;
  workId?: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const companySlug = String(body.companySlug ?? "");
    const importJobId = String(body.importJobId ?? "");
    const rowId = String(body.rowId ?? "");
    const workId = String(body.workId ?? "");

    if (!companySlug || !importJobId || !rowId || !workId) {
      return NextResponse.json(
        { ok: false, error: "Missing companySlug, importJobId, rowId or workId" },
        { status: 400 }
      );
    }

    const formData = new FormData();
    formData.set("companySlug", companySlug);
    formData.set("importJobId", importJobId);
    formData.set("rowId", rowId);
    formData.set("workId", workId);

    await manualMatchImportRowAction(formData);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Manual match failed",
      },
      { status: 500 }
    );
  }
}