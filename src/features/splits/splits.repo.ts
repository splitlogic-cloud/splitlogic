import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function listSplitsForWork(workId: string) {
  const { data, error } = await supabaseAdmin
    .from("splits")
    .select("id, party_id, share_percent")
    .eq("work_id", workId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSplit(params: {
  companyId: string;
  workId: string;
  partyId: string;
  sharePercent: number;
}) {
  const { error } = await supabaseAdmin.from("splits").insert({
    company_id: params.companyId,
    work_id: params.workId,
    party_id: params.partyId,
    share_percent: params.sharePercent,
  });

  if (error) throw new Error(error.message);
}

export async function updateSplit(params: {
  splitId: string;
  sharePercent: number;
}) {
  const { error } = await supabaseAdmin
    .from("splits")
    .update({ share_percent: params.sharePercent })
    .eq("id", params.splitId);

  if (error) throw new Error(error.message);
}

export async function deleteSplit(splitId: string) {
  const { error } = await supabaseAdmin
    .from("splits")
    .delete()
    .eq("id", splitId);

  if (error) throw new Error(error.message);
}

export function getSplitTotal(splits: any[]) {
  return splits.reduce((sum, s) => sum + Number(s.share_percent), 0);
}