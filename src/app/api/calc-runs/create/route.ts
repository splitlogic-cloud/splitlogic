import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCalcRunSnapshot } from "@/features/calcs/calcRuns.repo";
import { getActiveRulesetForDate } from "@/features/contracts/rulesets.repo";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

async function resolveCompanyIdFromBody(
  body: Record<string, unknown>
): Promise<string> {
  const rawCompanyId = String(body.companyId ?? "").trim();
  if (rawCompanyId) {
    return rawCompanyId;
  }

  const companySlug = String(body.companySlug ?? "").trim();
  if (!companySlug) {
    throw new Error("Missing companyId or companySlug");
  }

  const company = await requireCompanyBySlugForUser(companySlug);
  return company.id;
}

async function handle(body: Record<string, unknown>) {
  const periodStart = String(body.periodStart ?? "").trim();
  const periodEnd = String(body.periodEnd ?? "").trim();

  if (!periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "Missing periodStart or periodEnd" },
      { status: 400 }
    );
  }

  const companyId = await resolveCompanyIdFromBody(body);

  const ruleset = await getActiveRulesetForDate({
    companyId,
    date: periodEnd,
  });

  const snapshot = await createCalcRunSnapshot({
    companyId,
    rulesetId: ruleset.id,
    periodStart,
    periodEnd,
    engineVersion: "engine@0.1.0",
    roundingPolicyVersion: "round@1",
  });

  return NextResponse.json({ ok: true, ruleset, snapshot });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();

  if (authErr || !auth?.user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return handle(body);
}

// Allow quick testing in browser:
// /api/calc-runs/create?companySlug=...&periodStart=2023-05-01&periodEnd=2023-05-31
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();

  if (authErr || !auth?.user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const body: Record<string, unknown> = {
    companySlug: url.searchParams.get("companySlug"),
    periodStart: url.searchParams.get("periodStart"),
    periodEnd: url.searchParams.get("periodEnd"),
  };
  return handle(body);
}