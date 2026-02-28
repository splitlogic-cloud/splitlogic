import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/features/supabase/server";

export type CompanyContext = {
  companyId: string;
  role: "admin" | "accountant" | "artist";
};

export async function requireActiveCompany(companyId: string): Promise<CompanyContext> {
  const supabase = await createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    // Inloggad saknas → behandla som 404 (ingen läckage-info)
    notFound();
  }

  const { data: membership, error: memErr } = await supabase
    .from("memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userRes.user.id)
    .maybeSingle();

  // Om memberships-tabellen är skyddad av RLS kan memErr bli "permission denied"
  // Det ska också bli 404 ur användarens perspektiv.
  if (memErr) {
    notFound();
  }

  // Inte medlem → 404 (maskar existence)
  if (!membership) {
    notFound();
  }

  return {
    companyId,
    role: membership.role,
  };
}