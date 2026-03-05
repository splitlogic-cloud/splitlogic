// src/features/companies/companies.repo.ts
import "server-only";

import { requireUser } from "@/lib/auth/requireUser"; // justera import om din fil har annan
import { slugify } from "@/lib/utils/slugify"; // om du inte har slugify: se alt nedan

export async function createCompanyForUser(input: { name: string }) {
  const { supabase, userId } = await requireUser();

  const name = (input.name ?? "").trim();
  if (!name) throw new Error("name is required");

  // 1) skapa slug (unik-ish)
  const base = (typeof slugify === "function" ? slugify(name) : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  const slug = `${base}-${userId.slice(0, 6)}`;

  // 2) insert company (OBS: din tabell har base_currency)
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .insert({
      name,
      slug,
      base_currency: "SEK",
    })
    .select("*")
    .single();

  if (companyErr) throw companyErr;
  if (!company) throw new Error("Failed to create company");

  // 3) skapa membership (byt tabell/kolumnnamn om din heter annorlunda)
  // Vanliga varianter: company_memberships / memberships / company_users
  // Jag antar att du har company_memberships med (company_id, user_id, role)
  const { error: mErr } = await supabase.from("company_memberships").insert({
    company_id: company.id,
    user_id: userId,
    role: "owner",
  });

  if (mErr) {
    // om membership failar vill vi inte lämna skräp — men enklast nu: kasta fel
    throw mErr;
  }

  return company;
}