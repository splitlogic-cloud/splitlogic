import { NextResponse } from "next/server";
import { createCalcRunSnapshot } from "@/features/calcs/calcRuns.repo";
import { getActiveRulesetForDate } from "@/features/contracts/rulesets.repo";

async function handle(body: any) {
  if (!body?.companyId || !body?.periodStart || !body?.periodEnd) {
    return NextResponse.json(
      { error: "Missing companyId, periodStart, periodEnd" },
      { status: 400 }
    );
  }

  const ruleset = await getActiveRulesetForDate({
    companyId: body.companyId,
    date: body.periodEnd,
  });

  const snapshot = await createCalcRunSnapshot({
    companyId: body.companyId,
    rulesetId: ruleset.id,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    engineVersion: "engine@0.1.0",
    roundingPolicyVersion: "round@1",
  });

  return NextResponse.json({ ok: true, ruleset, snapshot });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(body);
}

// Allow quick testing in browser:
// /api/calc-runs/create?companyId=...&periodStart=2023-05-01&periodEnd=2023-05-31
export async function GET(req: Request) {
  const url = new URL(req.url);
  const body = {
    companyId: url.searchParams.get("companyId"),
    periodStart: url.searchParams.get("periodStart"),
    periodEnd: url.searchParams.get("periodEnd"),
  };
  return handle(body);
}