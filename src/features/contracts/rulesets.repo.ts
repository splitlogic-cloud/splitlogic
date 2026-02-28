import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getSb() {
  const s: any = await (createSupabaseServerClient as any)();
  // Support: returns client directly OR { supabase } OR { client }
  if (s?.from) return s;
  if (s?.supabase?.from) return s.supabase;
  if (s?.client?.from) return s.client;
  throw new Error("createSupabaseServerClient() did not return a Supabase client");
}

export type RulesetInsert = {
  company_id: string;
  name: string;
  version: string; // "v2.1"
  valid_from?: string; // YYYY-MM-DD
  valid_to?: string | null;
  rules_json: any;
};

export async function createRuleset(input: RulesetInsert) {
  const supabase = await getSb();

  const { data, error } = await supabase
    .from("contract_rulesets")
    .insert({
      ...input,
      valid_from: input.valid_from ?? new Date().toISOString().slice(0, 10),
    })
    .select("id,company_id,name,version,valid_from,valid_to,rules_json,created_at")
    .single();

  if (error) throw new Error(`createRuleset failed: ${error.message}`);
  return data;
}

export async function getActiveRulesetForDate(args: {
  companyId: string;
  date: string; // YYYY-MM-DD
}) {
  const supabase = await getSb();

  const { data, error } = await supabase
    .from("contract_rulesets")
    .select("id,company_id,name,version,valid_from,valid_to,rules_json")
    .eq("company_id", args.companyId)
    .lte("valid_from", args.date)
    .or(`valid_to.is.null,valid_to.gte.${args.date}`)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getActiveRulesetForDate failed: ${error.message}`);
  if (!data) throw new Error("No active ruleset found for date");
  return data;
}