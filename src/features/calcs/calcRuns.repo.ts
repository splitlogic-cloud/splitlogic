import "server-only";
import crypto from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listRevenueRowsForPeriod } from "@/features/revenue/revenue.repo";

async function getSb() {
  const s: any = await (createSupabaseServerClient as any)();
  if (s?.from) return s;
  if (s?.supabase?.from) return s.supabase;
  if (s?.client?.from) return s.client;
  throw new Error("createSupabaseServerClient() did not return a Supabase client");
}

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
    .join(",")}}`;
}

export async function computeRevenueInputHash(args: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
}) {
  const rows = await listRevenueRowsForPeriod(args);

  const payload = rows.map((r: any) => ({
    id: r.id,
    event_date: r.event_date,
    source_system: r.source_system,
    source_file_id: r.source_file_id,
    source_row_number: r.source_row_number,
    territory: r.territory,
    currency: r.currency,
    quantity: r.quantity,
    amount_gross: r.amount_gross,
    amount_net: r.amount_net,
    work_id: r.work_id,
    work_ref: r.work_ref,
    external_track_id: r.external_track_id,
  }));

  const serialized = stableStringify(payload);
  const hash = crypto.createHash("sha256").update(serialized).digest("hex");

  return { hash, rowCount: rows.length };
}

export async function createCalcRunSnapshot(args: {
  companyId: string;
  rulesetId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  engineVersion: string; // e.g. "engine@0.1.0"
  roundingPolicyVersion?: string; // default 'round@1'
}) {
  const supabase = await getSb();

  const { hash, rowCount } = await computeRevenueInputHash({
    companyId: args.companyId,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
  });

  if (rowCount === 0) {
    throw new Error("No revenue rows found in period; cannot create calc run");
  }

  const { data, error } = await supabase
    .from("calc_runs")
    .insert({
      company_id: args.companyId,
      ruleset_id: args.rulesetId,
      period_start: args.periodStart,
      period_end: args.periodEnd,
      input_hash: hash,
      engine_version: args.engineVersion,
      rounding_policy_version: args.roundingPolicyVersion ?? "round@1",
    })
    .select(
      "id,company_id,ruleset_id,period_start,period_end,input_hash,engine_version,rounding_policy_version,created_at"
    )
    .single();

  if (!error) return { ...data, already_existed: false };

  const { data: existing, error: fetchErr } = await supabase
    .from("calc_runs")
    .select(
      "id,company_id,ruleset_id,period_start,period_end,input_hash,engine_version,rounding_policy_version,created_at"
    )
    .eq("company_id", args.companyId)
    .eq("ruleset_id", args.rulesetId)
    .eq("period_start", args.periodStart)
    .eq("period_end", args.periodEnd)
    .eq("input_hash", hash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw new Error(`createCalcRunSnapshot failed: ${error.message} / fetch: ${fetchErr.message}`);
  if (!existing) throw new Error(`createCalcRunSnapshot failed: ${error.message}`);

  return { ...existing, already_existed: true };
}