// src/features/companies/companies.repo.ts
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * DB assumptions (based on your screenshot + earlier work):
 * - public.companies: id (uuid), name (text), slug (text), base_currency (char), created_at (timestamptz)
 * - public.company_members: company_id (uuid), user_id (uuid), role (text), created_at (timestamptz)
 *
 * RLS:
 * - company isolation + membership enforcement exists (you already built this)
 */

export type Company = {
  id: string;
  name: string;
  slug: string;
  base_currency: string | null;
  created_at: string | null;
};

export type CompanyMember = {
  company_id: string;
  user_id: string;
  role: string | null;
  created_at: string | null;
};

async function requireUser() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const user = data?.user;
  if (!user?.id) throw new Error("Not authenticated");

  return { supabase, userId: user.id };
}

function slugify(input: string) {
  const s = (input ?? "")
    .toLowerCase()
    .trim()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return s || "company";
}

async function findAvailableSlug(
  supabase: any,
  base: string
): Promise<string> {
  // Try base first, then base-2, base-3, etc.
  // NOTE: With RLS, your select should still work (it’ll only see allowed rows).
  // Even if it can't see other companies, slug collisions are rare; DB unique constraint is best.
  // If you have a UNIQUE index on companies.slug this is safe (we also handle insert error).
  let candidate = base.slice(0, 48);
  if (!candidate) candidate = "company";

  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? candidate : `${candidate}-${i + 1}`;

    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    // If RLS blocks this read, data may be null; we still return the slug and rely on insert error.
    if (error) {
      return slug;
    }
    if (!data) {
      return slug;
    }
  }

  // Fallback random suffix
  return `${candidate}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * List companies user is a member of.
 * Shape: [{ companies: {...}, role: "owner", created_at: ...}, ...]
 */
export async function listMyCompanies(): Promise<
  Array<Company & { role?: string | null }>
> {
  const { supabase, userId } = await requireUser();

  const { data, error } = await supabase
    .from("company_members")
    .select(
      `
      role,
      companies (
        id,
        name,
        slug,
        base_currency,
        created_at
      )
    `
    )
    .eq("user_id", userId);

  if (error) throw error;

  const rows = (data ?? [])
    .map((row: any) => {
      const c = row?.companies;
      if (!c) return null;
      return {
        id: c.id as string,
        name: c.name as string,
        slug: c.slug as string,
        base_currency: (c.base_currency ?? null) as string | null,
        created_at: (c.created_at ?? null) as string | null,
        role: (row.role ?? null) as string | null,
      };
    })
    .filter(Boolean) as Array<Company & { role?: string | null }>;

  // Sort by name (nice UX)
  rows.sort((a, b) => a.name.localeCompare(b.name, "sv"));

  return rows;
}

/**
 * Require that the current user is a member of company by slug.
 * Returns company + role.
 */
export async function requireCompanyBySlugForUser(companySlug: string): Promise<
  Company & { role?: string | null }
> {
  const { supabase, userId } = await requireUser();

  const slug = (companySlug ?? "").trim();
  if (!slug) throw new Error("Missing companySlug");

  const { data, error } = await supabase
    .from("company_members")
    .select(
      `
      role,
      companies (
        id,
        name,
        slug,
        base_currency,
        created_at
      )
    `
    )
    .eq("user_id", userId)
    .eq("companies.slug", slug)
    .maybeSingle();

  if (error) throw error;

  if (!data?.companies) {
    throw new Error("Not found or not a member of this company");
  }

  const c = data.companies as any;

  return {
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    base_currency: (c.base_currency ?? null) as string | null,
    created_at: (c.created_at ?? null) as string | null,
    role: (data.role ?? null) as string | null,
  };
}

/**
 * Create company + add membership as owner.
 * Input only supports { name } because your companies table does NOT have orgnr.
 */
export async function createCompanyForUser(input: { name: string }) {
  const { supabase, userId } = await requireUser();

  const name = (input?.name ?? "").trim();
  if (!name) throw new Error("Name is required");

  const base = slugify(name);
  const slug = await findAvailableSlug(supabase, base);

  // 1) create company
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .insert({
      name,
      slug,
      base_currency: "SEK",
    })
    .select("id,name,slug,base_currency,created_at")
    .single();

  if (companyErr) {
    // If slug collision (unique constraint), try again with random suffix once
    const msg = String((companyErr as any)?.message ?? "");
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      const slug2 = `${base.slice(0, 42)}-${Math.random().toString(36).slice(2, 8)}`;
      const { data: company2, error: companyErr2 } = await supabase
        .from("companies")
        .insert({
          name,
          slug: slug2,
          base_currency: "SEK",
        })
        .select("id,name,slug,base_currency,created_at")
        .single();
      if (companyErr2) throw companyErr2;

      // membership
      const { error: memberErr2 } = await supabase.from("company_members").insert({
        company_id: company2.id,
        user_id: userId,
        role: "owner",
      });
      if (memberErr2) throw memberErr2;

      return company2;
    }

    throw companyErr;
  }

  // 2) add membership (owner)
  const { error: memberErr } = await supabase.from("company_members").insert({
    company_id: company.id,
    user_id: userId,
    role: "owner",
  });

  if (memberErr) throw memberErr;

  return company as Company;
}