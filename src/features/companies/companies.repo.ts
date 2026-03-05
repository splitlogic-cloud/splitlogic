// src/features/companies/companies.repo.ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CompanyRole = "admin" | "accountant" | "artist";

export type MyCompany = {
  id: string;
  name: string;
  slug: string;
  role: CompanyRole | null;
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`auth.getUser: ${error.message}`);
  if (!data.user) throw new Error("Not authenticated");
  return { supabase, userId: data.user.id };
}

export async function listMyCompanies(): Promise<MyCompany[]> {
  const { supabase, userId } = await requireUser();

  const { data, error } = await supabase
    .from("memberships")
    .select(
      `
      role,
      companies:company_id (
        id,
        name,
        slug
      )
    `
    )
    .eq("user_id", userId)
    .limit(500);

  if (error) throw new Error(`listMyCompanies: ${error.message}`);

  const out =
    data?.map((r: any) => ({
      id: r.companies?.id as string,
      name: r.companies?.name as string,
      slug: r.companies?.slug as string,
      role: (r.role ?? null) as CompanyRole | null,
    })) ?? [];

  return out.filter((c) => !!c.id).sort((a, b) => a.name.localeCompare(b.name));
}

export async function requireCompanyBySlugForUser(companySlug: string): Promise<MyCompany> {
  const { supabase, userId } = await requireUser();

  // Läs company (RLS måste tillåta detta via memberships-policy)
  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (cErr) throw new Error(`companies.select: ${cErr.message}`);
  if (!company) throw new Error("Company not found");

  // Extra hård kontroll (om du vill ha tydligt fel vid membership-problem)
  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("role")
    .eq("company_id", company.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (mErr) throw new Error(`memberships.select: ${mErr.message}`);
  if (!membership) throw new Error("No access to this company");

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    role: (membership.role ?? null) as CompanyRole | null,
  };
}

export async function createCompanyForUser(input: { name: string; orgnr?: string | null }) { ... }
  const { supabase, userId } = await requireUser();

  const name = (input.name ?? "").trim();
  if (name.length < 2) throw new Error("Company name too short");

  const baseSlug = slugify(name);
  if (!baseSlug) throw new Error("Could not generate slug");

  // hitta ledig slug
  let slug = baseSlug;
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
    const { data } = await supabase.from("companies").select("id").eq("slug", candidate).maybeSingle();
    if (!data) {
      slug = candidate;
      break;
    }
  }

  const { data: company, error: insErr } = await supabase
    .from("companies")
    .insert({ name, slug })
    .select("id, name, slug")
    .single();

  if (insErr) throw new Error(`companies.insert: ${insErr.message}`);

  // din DB tillåter admin/accountant/artist → sätt admin som default
  const { error: memErr } = await supabase.from("memberships").insert({
    company_id: company.id,
    user_id: userId,
    role: "admin",
  });

  if (memErr) {
    await supabase.from("companies").delete().eq("id", company.id);
    throw new Error(`memberships.insert: ${memErr.message}`);
  }

  return { id: company.id, name: company.name, slug: company.slug, role: "admin" };
}