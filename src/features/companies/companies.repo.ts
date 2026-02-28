import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Company = {
  id: string;
  name: string;
  slug: string;
  base_currency: string;
  created_at: string;
};

export async function requireCompanyBySlugForUser(
  slug: string
): Promise<Company> {
  if (!slug) throw new Error("requireCompanyBySlugForUser: missing slug");

  // NOTE: no joins, no embedded relations → cannot multiply rows
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id,name,slug,base_currency,created_at")
    .eq("slug", slug.trim())
    .limit(1);

  if (error) throw new Error(`requireCompanyBySlugForUser: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`requireCompanyBySlugForUser: company not found for slug=${slug}`);
  }

  return data[0] as Company;
}