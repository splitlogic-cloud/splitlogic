import "server-only";

import { NextResponse } from "next/server";
import { finalizeImportRowsForJob } from "@/features/imports/imports.processor";

type ProcessBody = {
  importJobId?: string;
  import_id?: string;
  importId?: string;
  id?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ProcessBody;

  const importJobId =
    body.importJobId ??
    body.importId ??
    body.import_id ??
    body.id ??
    null;

  if (!importJobId) {
    return NextResponse.json(
      { error: "Missing importJobId" },
      { status: 400 }
    );
  }

  const result = await finalizeImportRowsForJob(importJobId);

  return NextResponse.json({
    ok: true,
    importJobId,
    ...result,
  });
}