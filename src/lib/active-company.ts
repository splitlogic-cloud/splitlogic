import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/features/supabase/server";
import { getCompanyMembership } from "@/lib/company-membership";

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

  const membership = await getCompanyMembership({
    companyId,
    userId: userRes.user.id,
  });

  if (!membership) {
    notFound();
  }

  return {
    companyId,
    role:
      membership.role === "admin" ||
      membership.role === "accountant" ||
      membership.role === "artist"
        ? membership.role
        : "artist",
  };
}