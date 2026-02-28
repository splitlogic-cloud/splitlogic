import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveRulesetForDate } from "@/features/contracts/rulesets.repo";
import { createCalcRunSnapshot } from "@/features/calcs/calcRuns.repo";
import { listRevenueRowsForPeriod } from "@/features/revenue/revenue.repo";

async function getSb() {
  const s: any = await (createSupabaseServerClient as any)();
  if (s?.from) return s;
  if (s?.supabase?.from) return s.supabase;
  if (s?.client?.from) return s.client;
  throw new Error("createSupabaseServerClient() did not return a Supabase client");
}

type SplitRule = {
  party_id?: string | null;
  party_label: string;
  percent: number; // 0..100
};

export async function runAllocationV1(args: {
  companyId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
}) {
  // 1) pick ruleset
  const ruleset = await getActiveRulesetForDate({
    companyId: args.companyId,
    date: args.periodEnd,
  });

  const splits: SplitRule[] = Array.isArray(ruleset.rules_json?.splits)
    ? ruleset.rules_json.splits
    : [];

  if (splits.length === 0) {
    throw new Error("ruleset.rules_json.splits is missing/empty");
  }

  const pctSum = splits.reduce((a, s) => a + Number(s.percent ?? 0), 0);
  if (Math.abs(pctSum - 100) > 0.0001) {
    throw new Error(`splits must sum to 100, got ${pctSum}`);
  }

  // 2) create calc snapshot (hash + engine version)
  const calc = await createCalcRunSnapshot({
    companyId: args.companyId,
    rulesetId: ruleset.id,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    engineVersion: "engine@0.1.0",
    roundingPolicyVersion: "round@1",
  });

  // 3) load canonical revenue rows
  const rows = await listRevenueRowsForPeriod({
    companyId: args.companyId,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
  });

  if (rows.length === 0) throw new Error("No revenue rows found in period");

  // 4) total net + currency (v1 assumes single currency)
  const currency = (rows[0].currency ?? "SEK").toUpperCase();
  const multiCurrency = rows.some((r: any) => (r.currency ?? "").toUpperCase() !== currency);
  if (multiCurrency) throw new Error("V1 allocation only supports single currency per period");

  const totalNet = rows.reduce((a: number, r: any) => a + Number(r.amount_net ?? 0), 0);

  // 5) create allocation_run + lines
  const supabase = await getSb();

  const { data: run, error: runErr } = await supabase
    .from("allocation_runs")
    .insert({
      company_id: args.companyId,
      calc_run_id: calc.id,
      ruleset_id: ruleset.id,
      total_amount_net: totalNet,
      currency,
    })
    .select("id,company_id,calc_run_id,ruleset_id,total_amount_net,currency,created_at")
    .single();

  if (runErr) throw new Error(`allocation_runs insert failed: ${runErr.message}`);

  const lines = splits.map((s) => {
    const pct = Number(s.percent);
    const amount = (totalNet * pct) / 100;

    return {
      company_id: args.companyId,
      allocation_run_id: run.id,
      party_id: s.party_id ?? null,
      party_label: s.party_label,
      percent: pct,
      amount_net: amount,
    };
  });

  const { error: lineErr } = await supabase.from("allocation_lines").insert(lines);
  if (lineErr) throw new Error(`allocation_lines insert failed: ${lineErr.message}`);

  return { ruleset, calc_run: calc, allocation_run: run, lines };
}