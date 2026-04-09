// src/features/companies/companies.repo.ts
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function isSchemaCompatibilityError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find") ||
    normalized.includes("relation") ||
    normalized.includes("column")
  );
}

function isUniqueViolation(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("duplicate key") || normalized.includes("unique");
}

function isRoleConstraintError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('null value in column "role"') ||
    (normalized.includes("check constraint") && normalized.includes("role")) ||
    (normalized.includes("invalid input value for enum") && normalized.includes("role"))
  );
}

function mapCompanyRow(row: Record<string, unknown>): Company {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    base_currency: asNullableString(row.base_currency),
    created_at: asNullableString(row.created_at),
  };
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
  if (!company) redirect("/companies");

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
  if (!membership) redirect("/companies");

  return company as Company;
}

/**
 * Create a company and add creator membership.
 * NOTE: companies table does not have orgnr in your DB.
 */
export async function createCompanyForUser(input: { name: string; base_currency?: string | null }) {
  const { supabase, user } = await requireUser();
  let writeClient: ReturnType<typeof getSupabaseAdmin> | typeof supabase = supabase;
  try {
    writeClient = getSupabaseAdmin();
  } catch (error) {
    // Fallback to user-scoped client if service role env is unavailable.
    // This may still be blocked by RLS, but keeps compatibility in minimal envs.
    console.warn("createCompanyForUser: service role unavailable, using session client", error);
  }

  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Name is required.");

  const base_currency = (input.base_currency ?? "SEK")?.toString().trim() || "SEK";

  const baseSlug = slugify(name) || "company";
  const slugCandidates = Array.from(
    new Set(
      [0, 1, 2, 3].map((index) =>
        index === 0
          ? `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`
          : `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`
      )
    )
  );

  const insertVariants = [
    {
      payload: (slug: string) => ({ name, slug, base_currency }),
      select: "id,name,slug,base_currency,created_at",
    },
    {
      payload: (slug: string) => ({ name, slug }),
      select: "id,name,slug,created_at",
    },
    {
      payload: (slug: string) => ({ name, slug }),
      select: "id,name,slug",
    },
  ] as const;

  let company: Company | null = null;
  let lastCompanyErrorMessage = "unknown";

  outer: for (const slug of slugCandidates) {
    for (const variant of insertVariants) {
      const { data, error } = await writeClient
        .from("companies")
        .insert(variant.payload(slug))
        .select(variant.select)
        .single();

      if (!error) {
        company = mapCompanyRow(data as unknown as Record<string, unknown>);
        break outer;
      }

      lastCompanyErrorMessage = error.message;
      if (isUniqueViolation(error.message)) {
        break;
      }
      if (isSchemaCompatibilityError(error.message)) {
        continue;
      }

      console.error("createCompanyForUser insert company error:", error);
      throw new Error(`Could not create company: ${error.message}`);
    }
  }

  if (!company) {
    throw new Error(`Could not create company: ${lastCompanyErrorMessage}`);
  }

  const membershipAttempts = [
    { table: "company_memberships", userColumn: "user_id" as const },
    { table: "company_memberships", userColumn: "profile_id" as const },
    { table: "memberships", userColumn: "user_id" as const },
    { table: "memberships", userColumn: "profile_id" as const },
  ] as const;
  const roleCandidates = [
    "owner",
    "admin",
    "member",
    "OWNER",
    "ADMIN",
    "MEMBER",
    null,
  ] as const;

  let membershipCreated = false;
  let lastMembershipErrorMessage = "unknown";

  outerMembership: for (const attempt of membershipAttempts) {
    for (const roleCandidate of roleCandidates) {
      const payload: Record<string, string> = {
        company_id: company.id,
        [attempt.userColumn]: user.id,
      };

      if (roleCandidate !== null) {
        payload.role = roleCandidate;
      }

      const { error: membershipErr } = await writeClient
        .from(attempt.table)
        .insert(payload as never);

      if (!membershipErr) {
        membershipCreated = true;
        break outerMembership;
      }

      lastMembershipErrorMessage = membershipErr.message;

      if (isUniqueViolation(membershipErr.message)) {
        membershipCreated = true;
        break outerMembership;
      }

      if (isRoleConstraintError(membershipErr.message)) {
        continue;
      }

      if (isSchemaCompatibilityError(membershipErr.message)) {
        const normalized = membershipErr.message.toLowerCase();
        if (normalized.includes(attempt.userColumn)) {
          break;
        }
        continue;
      }

      console.error("createCompanyForUser insert membership error:", membershipErr);
      throw new Error(`Company created, but membership failed: ${membershipErr.message}`);
    }
  }

  if (!membershipCreated) {
    throw new Error(
      `Company created, but membership failed: ${lastMembershipErrorMessage}`
    );
  }

  return company;
}