import "server-only";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMembershipCompanyRows, resolveMembershipUserIdFields } from "@/lib/company-membership";

type CompanyRow = {
  id: string;
  slug: string | null;
  name: string | null;
  base_currency?: string | null;
};

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

  const userField = await resolveMembershipUserIdFields(supabase, auth.user.id);
  const companiesRaw = await getMembershipCompanyRows(supabase, auth.user.id, userField);

  const companies = q
    ? companiesRaw.filter((c: CompanyRow) => {
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

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {}
  const payload = (body ?? {}) as { slug?: unknown; name?: unknown };
  const slug = String(payload.slug ?? "").trim();
  const name = String(payload.name ?? "").trim() || slug;

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  // 1) create company
  const { data: c, error: cErr } = await supabase
    .from("companies")
    .insert({ slug, name })
    .select("id,slug,name")
    .single();

  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 });

  // 2) create membership (supports company_memberships + legacy memberships)
  const userField = await resolveMembershipUserIdFields(supabase, auth.user.id);
  const membershipPayload = { company_id: c.id, [userField]: auth.user.id } as Record<string, unknown>;

  let mErr: { message: string } | null = null;
  const m1 = await supabase.from("company_memberships").insert(membershipPayload as never);
  if (m1.error) {
    const m2 = await supabase.from("memberships").insert(membershipPayload as never);
    if (m2.error) {
      mErr = { message: m2.error.message };
    }
  }

  if (mErr) {
    return NextResponse.json(
      { ok: false, error: `company created but membership failed: ${mErr.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, company: c }, { status: 200 });
}