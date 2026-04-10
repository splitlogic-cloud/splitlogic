import "server-only";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getStatementHeader,
  listStatementLines,
} from "@/features/statements/statements.repo";
import { buildStatementPdf } from "@/features/statements/build-statement-pdf";

type RouteContext = {
  params: Promise<{
    companySlug: string;
    id: string;
  }>;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

export async function GET(_request: Request, context: RouteContext) {
  const { companySlug, id } = await context.params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    return new NextResponse("Company not found", { status: 404 });
  }

  const header = await getStatementHeader(company.id, id);

  if (!header) {
    return new NextResponse("Statement not found", { status: 404 });
  }

  const lines = await listStatementLines(id);
  const pdfBytes = await buildStatementPdf({
    header: {
      id: header.id,
      party_name: header.party_name,
      period_start: header.period_start,
      period_end: header.period_end,
      total_amount: header.total_amount,
      currency: header.currency,
      status: header.status,
      created_at: header.created_at,
    },
    lines: lines.map((line) => ({
      id: line.id,
      title: line.title,
      artist: line.artist,
      isrc: line.isrc,
      platform: line.platform,
      territory: line.territory,
      transaction_date: line.transaction_date,
      amount: line.amount,
      currency: line.currency,
      units: line.units,
    })),
  });

  const pdfBuffer = toArrayBuffer(pdfBytes);

  const safePartyName =
    (header.party_name ?? "statement")
      .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "statement";

  const filename = `${safePartyName}-${id}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}