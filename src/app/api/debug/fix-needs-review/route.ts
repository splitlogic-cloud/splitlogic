import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeIsrc } from "@/features/matching/normalize";

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKey(title: string, artist: string) {
  return `${title}__${artist}`;
}

export async function POST(req: Request) {
  const body = await req.json();

  const { importJobId, companySlug } = body;

  if (!importJobId || !companySlug) {
    return NextResponse.json({ ok: false, error: "Missing params" }, { status: 400 });
  }

  // 1. company
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .single();

  if (!company) {
    return NextResponse.json({ ok: false, error: "Company not found" }, { status: 404 });
  }

  // 2. load needs_review rows
  const { data: rows } = await supabaseAdmin
    .from("import_rows")
    .select("id, raw_title, normalized, canonical")
    .eq("import_job_id", importJobId)
    .eq("status", "needs_review");

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, message: "No rows to fix" });
  }

  // 3. load works
  const { data: works } = await supabaseAdmin
    .from("works")
    .select("id, normalized_title, normalized_artist, isrc")
    .eq("company_id", company.id);

  const byIsrc = new Map<string, string>();
  const byKey = new Map<string, string>();

  for (const w of works ?? []) {
    if (w.isrc) byIsrc.set(w.isrc, w.id);

    if (w.normalized_title && w.normalized_artist) {
      byKey.set(buildKey(w.normalized_title, w.normalized_artist), w.id);
    }
  }

  let fixed = 0;

  for (const row of rows) {
    const isrc = normalizeIsrc(row.normalized?.isrc ?? null);

    let workId: string | null = null;

    if (isrc && byIsrc.has(isrc)) {
      workId = byIsrc.get(isrc)!;
    } else {
      const title = normalizeText(row.raw_title ?? "");
      const artist = normalizeText(row.normalized?.artist ?? "");

      if (title && artist) {
        const key = buildKey(title, artist);
        if (byKey.has(key)) {
          workId = byKey.get(key)!;
        }
      }
    }

    if (!workId) continue;

    await supabaseAdmin
      .from("import_rows")
      .update({
        work_id: workId,
        matched_work_id: workId,
        match_source: "manual",
        match_confidence: 0.9,
        status: "matched",
        allocation_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    fixed++;
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    fixed,
  });
}