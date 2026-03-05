// src/features/companies/companies.repo.ts
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type Company = {
  id: string;
  name: string;
  slug: string;
  base_currency: string | null;
  created_at: string | null;
};

export type CompanyMembership = {
  company_id: string;
  user_id: string;
  role: string | null;
  created_at: string | null;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  const user = data?.user ?? null;
  if (error || !user) redirect("/login");

  return { supabase, user };
}

/**
 * List companies for the signed-in user.
 * Uses: public.company_memberships (company_id, user_id, role, created_at)
 * and joins to: public.companies
 */
export async function listMyCompanies(): Promise<Company[]> {
  const { supabase, user } = await requireUser();

  // Join company_memberships -> companies
  const { data, error } = await supabase
    .from("company_memberships")
    .select(
      `
      company:companies (
        id,
        name,
        slug,
        base_currency,
        created_at
      )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    // Fail loudly in logs, but keep message clean
    console.error("listMyCompanies error:", error);
    throw new Error("Could not load companies.");
  }

  const companies = (data ?? [])
    .map((row: any) => row.company as Company | null)
    .filter(Boolean) as Company[];

  return companies;
}

/**
 * Require access to a company by slug for current user.
 * Returns the company if membership exists.
 */
export async function requireCompanyBySlugForUser(companySlug: string): Promise<Company> {
  const { supabase, user } = await requireUser();

  // 1) Fetch company by slug
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id,name,slug,base_currency,created_at")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyErr) {
    console.error("requireCompanyBySlugForUser company lookup error:", companyErr);
    throw new Error("Could not load company.");
  }
  if (!company) {
    // slug not found
    redirect("/companies");
  }

  // 2) Check membership
  const { data: membership, error: membershipErr } = await supabase
    .from("company_memberships")
    .select("company_id,user_id,role,created_at")
    .eq("company_id", company.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipErr) {
    console.error("requireCompanyBySlugForUser membership error:", membershipErr);
    throw new Error("Could not verify membership.");
  }
  if (!membership) {
    // user not allowed
    redirect("/companies");
  }

  return company as Company;
}

/**
 * Create a company and add creator membership.
 * NOTE: Your companies table does NOT have orgnr (per your screenshot), so we don't store it.
 */
export async function createCompanyForUser(input: { name: string; base_currency?: string | null }) {
  const { supabase, user } = await requireUser();

  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Name is required.");

  const base_currency = (input.base_currency ?? "SEK")?.toString().trim() || "SEK";

  // Create a unique-ish slug
  const baseSlug = slugify(name) || "company";
  const suffix = Math.random().toString(36).slice(2, 7);
  const slug = `${baseSlug}-${suffix}`;

  // 1) Insert company
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .insert({
      name,
      slug,
      base_currency,
    })
    .select("id,name,slug,base_currency,created_at")
    .single();

  if (companyErr) {
    console.error("createCompanyForUser insert company error:", companyErr);
    throw new Error("Could not create company.");
  }

  // 2) Insert membership
  const { error: membershipErr } = await supabase.from("company_memberships").insert({
    company_id: company.id,
    user_id: user.id,
    role: "owner",
  });

  if (membershipErr) {
    console.error("createCompanyForUser insert membership error:", membershipErr);
    // optional: best-effort cleanup could be added, but keep it simple now
    throw new Error("Company created, but membership failed.");
  }

  return company as Company;
}