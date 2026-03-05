import "server-only";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/companies
 * Returns companies the current user is a member of.
 *
 * Query:
 *  - q?: string (optional search on slug/name if those columns exist)
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  // must be logged in
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  // Your canonical membership table is `memberships` (not company_memberships)
  // memberships: company_id, user_id
  // companies: id, slug, (maybe name)
  let query = supabase
    .from("memberships")
    .select("company_id, companies:companies(id,slug,name)")
    .eq("user_id", auth.user.id);

  // Optional search if name/slug exists in companies
  if (q) {
    // ilike on related table fields doesn't work directly in PostgREST select;
    // simplest: fetch and filter client-side in this endpoint.
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const companiesRaw = (data ?? [])
    .map((r: any) => r.companies)
    .filter(Boolean);

  const companies = q
    ? companiesRaw.filter((c: any) => {
        const slug = String(c.slug ?? "").toLowerCase();
        const name = String(c.name ?? "").toLowerCase();
        const qq = q.toLowerCase();
        return slug.includes(qq) || name.includes(qq);
      })
    : companiesRaw;

  return NextResponse.json({ ok: true, companies }, { status: 200 });
}

/**
 * POST /api/companies
 * Creates a company (and makes the current user a member).
 *
 * Body:
 *  - name?: string
 *  - slug: string
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const slug = String(body?.slug ?? "").trim();
  const name = String(body?.name ?? "").trim() || slug;

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  // 1) create company
  const { data: c, error: cErr } = await supabase
    .from("companies")
    .insert({ slug, name } as any)
    .select("id,slug,name")
    .single();

  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 });

  // 2) create membership
  const { error: mErr } = await supabase
    .from("memberships")
    .insert({ company_id: c.id, user_id: auth.user.id } as any);

  if (mErr) {
    return NextResponse.json(
      { ok: false, error: `company created but membership failed: ${mErr.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, company: c }, { status: 200 });
}