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

function randomSlugSuffix(length = 5) {
  return Math.random().toString(36).slice(2, 2 + length);
}

function isMissingCreateCompanyRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const normalized = typeof message === "string" ? message.toLowerCase() : "";

  return (
    code === "42883" ||
    (normalized.includes("create_company_for_user") &&
      (normalized.includes("does not exist") || normalized.includes("not found")))
  );
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  const user = data?.user ?? null;
  if (error || !user) redirect("/login");

  return { supabase, user };
}

/**
 * List companies for signed-in user via company_memberships -> companies join.
 * NOTE: we do NOT assume company_memberships has created_at.
 */
export async function listMyCompanies(): Promise<Company[]> {
  const { supabase, user } = await requireUser();

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
    .eq("user_id", user.id);

  if (error) {
    console.error("listMyCompanies error:", error);
    throw new Error("Could not load companies.");
  }

  return (data ?? [])
    .map((row: any) => row.company as Company | null)
    .filter(Boolean) as Company[];
}

/**
 * Require access to a company by slug for current user.
 */
export async function requireCompanyBySlugForUser(companySlug: string): Promise<Company> {
  const { supabase, user } = await requireUser();

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id,name,slug,base_currency,created_at")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyErr) {
    console.error("requireCompanyBySlugForUser company lookup error:", companyErr);
    throw new Error("Could not load company.");
  }
  if (!company) redirect("/select-company");

  // Membership check (ONLY columns that are guaranteed to exist)
  const { data: membership, error: membershipErr } = await supabase
    .from("company_memberships")
    .select("company_id,user_id,role")
    .eq("company_id", company.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipErr) {
    console.error("requireCompanyBySlugForUser membership error:", membershipErr);
    throw new Error("Could not verify membership.");
  }
  if (!membership) redirect("/select-company");

  return company as Company;
}

/**
 * Create a company and add creator membership.
 * NOTE: companies table does not have orgnr in your DB.
 */
export async function createCompanyForUser(input: { name: string; base_currency?: string | null }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("You must be signed in to create a company.");
  }

  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Name is required.");

  const base_currency = (input.base_currency ?? "SEK")?.toString().trim() || "SEK";

  const baseSlug = slugify(name) || "company";
  const rpcSlug = `${baseSlug}-${randomSlugSuffix()}`;

  const { error: rpcError } = await supabase.rpc("create_company_for_user", {
    p_name: name,
    p_slug: rpcSlug,
  });

  if (!rpcError) {
    const { data: rpcCompany, error: rpcCompanyLookupError } = await supabase
      .from("companies")
      .select("id,name,slug,base_currency,created_at")
      .eq("slug", rpcSlug)
      .maybeSingle();

    if (rpcCompanyLookupError) {
      console.error("createCompanyForUser rpc company lookup error:", rpcCompanyLookupError);
      throw new Error("Company created, but lookup failed.");
    }
    if (!rpcCompany) {
      throw new Error("Company created, but lookup returned no row.");
    }
    return rpcCompany as Company;
  }

  // Some environments do not have the RPC function deployed yet.
  // Fall back to direct inserts to avoid blocking onboarding.
  if (!isMissingCreateCompanyRpcError(rpcError)) {
    console.error("createCompanyForUser rpc error:", rpcError);
    throw new Error(`Could not create company: ${rpcError.message}`);
  }

  console.warn("createCompanyForUser rpc missing, falling back to direct inserts");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = `${baseSlug}-${randomSlugSuffix(5 + attempt)}`;

    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .insert({ name, slug, base_currency })
      .select("id,name,slug,base_currency,created_at")
      .single();

    if (companyErr) {
      const maybeCode = (companyErr as { code?: string }).code;
      if (maybeCode === "23505") {
        continue;
      }
      console.error("createCompanyForUser insert company error:", companyErr);
      throw new Error(`Could not create company: ${companyErr.message}`);
    }

    const { error: membershipErr } = await supabase.from("company_memberships").insert({
      company_id: company.id,
      user_id: user.id,
      role: "owner",
    });

    if (membershipErr) {
      console.error("createCompanyForUser insert membership error:", membershipErr);
      throw new Error(`Company created, but membership failed: ${membershipErr.message}`);
    }

    return company as Company;
  }

  throw new Error("Could not create company due to repeated slug conflicts.");
}