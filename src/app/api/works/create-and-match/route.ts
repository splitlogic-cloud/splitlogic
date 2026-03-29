import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { manualMatchImportRowAction } from "@/app/c/[companySlug]/imports/[importJobId]/actions";

type Body = {
  companyId?: string;
  companySlug?: string;
  importJobId?: string;
  rowId?: string;
  title?: string;
  artist?: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|featuring)\.?\b.*$/gi, " ")
    .replace(
      /\b(remix|mix|edit|version|radio edit|extended|live|mono|stereo)\b/gi,
      " "
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const companyId = String(body.companyId ?? "");
    const companySlug = String(body.companySlug ?? "");
    const importJobId = String(body.importJobId ?? "");
    const rowId = String(body.rowId ?? "");
    const title = String(body.title ?? "").trim();
    const artist =
      typeof body.artist === "string" && body.artist.trim()
        ? body.artist.trim()
        : null;

    if (!companyId || !companySlug || !importJobId || !rowId || !title) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing companyId, companySlug, importJobId, rowId or title",
        },
        { status: 400 }
      );
    }

    const normalizedTitle = normalizeText(title);
    const normalizedArtist = normalizeText(artist);

    if (!normalizedTitle) {
      return NextResponse.json(
        { ok: false, error: "Could not normalize title" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("works")
      .select("id")
      .eq("company_id", companyId)
      .eq("normalized_title", normalizedTitle)
      .eq("normalized_artist", normalizedArtist)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { ok: false, error: `Failed to check existing work: ${existingError.message}` },
        { status: 500 }
      );
    }

    let workId: string;

    if (existing?.id) {
      workId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("works")
        .insert({
          company_id: companyId,
          title,
          artist,
          normalized_title: normalizedTitle,
          normalized_artist: normalizedArtist,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        return NextResponse.json(
          {
            ok: false,
            error: `Failed to create work: ${insertError?.message ?? "unknown error"}`,
          },
          { status: 500 }
        );
      }

      workId = inserted.id;
    }

    const formData = new FormData();
    formData.set("companySlug", companySlug);
    formData.set("importJobId", importJobId);
    formData.set("rowId", rowId);
    formData.set("workId", workId);

    await manualMatchImportRowAction(formData);

    return NextResponse.json({
      ok: true,
      workId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Create work and match failed",
      },
      { status: 500 }
    );
  }
}