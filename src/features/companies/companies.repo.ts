// src/features/companies/companies.repo.ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CompanyRole = "owner" | "admin" | "member" | string;

export type MyCompany = {
  id: string;
  name: string;
  slug: string;
  role?: CompanyRole | null;
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

/**
 * Reads the current authenticated user id (server-side).
 */
async function requireUserId() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`auth.getUser: ${error.message}`);
  const userId = data?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  return { supabase, userId };
}

/**
 * List companies the current user belongs to.
 * Uses:
 * - public.memberships(user_id, company_id, role?)
 * - public.companies(id, name, slug)
 */
export async function listMyCompanies(): Promise<MyCompany[]> {
  const { supabase, userId } = await requireUserId();

  // role-kolumn kan heta role eller något annat. Vi försöker läsa role,
  // och om den inte finns så blir den null (Supabase returnerar error om kolumn saknas).
  // För att vara robust: vi gör först en "snäll" select utan role, sen försöker vi med role.
  const baseSelect = `
    company_id,
    companies:company_id (
      id, name, slug
    )
  `;

  const { data: rowsBase, error: errBase } = await supabase
    .from("memberships")
    .select(baseSelect)
    .eq("user_id", userId)
    .limit(500);

  if (errBase) throw new Error(`listMyCompanies(memberships): ${errBase.message}`);

  // Försök att också hämta role om den finns
  const { data: rowsRole, error: errRole } = await supabase
    .from("memberships")
    .select(
      `
      role,
      ${baseSelect}
    `
    )
    .eq("user_id", userId)
    .limit(500);

  const useRole = !errRole && Array.isArray(rowsRole);

  const rows = (useRole ? rowsRole : rowsBase) ?? [];

  const companies = rows
    .map((r: any) => {
      const c = r?.companies;
      if (!c?.id) return null;
      return {
        id: c.id as string,
        name: (c.name ?? "") as string,
        slug: (c.slug ?? "") as string,
        role: useRole ? ((r.role ?? null) as CompanyRole | null) : null,
      } as MyCompany;
    })
    .filter(Boolean) as MyCompany[];

  companies.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return companies;
}

/**
 * Require access to a company by slug.
 * IMPORTANT: If you have RLS on companies, the select may return null even if the row exists,
 * unless companies_select policy allows it via memberships.
 */
export async function requireCompanyBySlugForUser(companySlug: string): Promise<MyCompany> {
  const { supabase, userId } = await requireUserId();

  // 1) Load company by slug
  const { data: c, error: cErr } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (cErr) throw new Error(`requireCompanyBySlugForUser: ${cErr.message}`);
  if (!c?.id) throw new Error("Company not found");

  // 2) Check membership exists (and optionally role)
  const { data: m, error: mErr } = await supabase
    .from("memberships")
    .select("role")
    .eq("company_id", c.id)
    .eq("user_id", userId)
    .maybeSingle();

  // Om role-kolumn inte finns: gör fallback-select utan role
  if (mErr && (mErr.message?.includes("column") || mErr.code === "42703")) {
    const { data: m2, error: m2Err } = await supabase
      .from("memberships")
      .select("company_id")
      .eq("company_id", c.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (m2Err) throw new Error(`requireCompanyBySlugForUser(memberships): ${m2Err.message}`);
    if (!m2) throw new Error("No access to this company");

    return { id: c.id, name: c.name, slug: c.slug, role: null };
  }

  if (mErr) throw new Error(`requireCompanyBySlugForUser(memberships): ${mErr.message}`);
  if (!m) throw new Error("No access to this company");

  return { id: c.id, name: c.name, slug: c.slug, role: (m as any).role ?? null };
}

/**
 * Create company + membership (owner).
 * NOTE: Assumes:
 * - public.companies has columns: name, slug
 * - public.memberships has columns: company_id, user_id, (optional) role
 */
export async function createCompanyForUser(input: {
  name: string;
  // orgnr intentionally ignored (your companies table doesn't have it)
  orgnr?: string | null;
}): Promise<MyCompany> {
  const { supabase, userId } = await requireUserId();

  const name = (input.name ?? "").trim();
  if (name.length < 2) throw new Error("Company name too short");

  const baseSlug = slugify(name);
  if (!baseSlug) throw new Error("Could not generate slug");

  // Find a free slug (up to 10 attempts)
  let slug = baseSlug;
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;

    const { data: existing, error: exErr } = await supabase
      .from("companies")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (exErr) throw new Error(`createCompanyForUser(slug check): ${exErr.message}`);
    if (!existing) {
      slug = candidate;
      break;
    }
  }

  // 1) Insert company
  const { data: createdCompany, error: insErr } = await supabase
    .from("companies")
    .insert({ name, slug })
    .select("id, name, slug")
    .single();

  if (insErr) throw new Error(`createCompanyForUser(insert company): ${insErr.message}`);

  // 2) Insert membership
  // Try with role first; if role column doesn't exist, fallback to insert without role.
  const { error: memErr } = await supabase.from("memberships").insert({
    company_id: createdCompany.id,
    user_id: userId,
    role: "owner",
  } as any);

  if (memErr && (memErr.message?.includes("column") || memErr.code === "42703")) {
    const { error: memErr2 } = await supabase.from("memberships").insert({
      company_id: createdCompany.id,
      user_id: userId,
    });

    if (memErr2) {
      // rollback company
      await supabase.from("companies").delete().eq("id", createdCompany.id);
      throw new Error(`createCompanyForUser(insert membership): ${memErr2.message}`);
    }
  } else if (memErr) {
    await supabase.from("companies").delete().eq("id", createdCompany.id);
    throw new Error(`createCompanyForUser(insert membership): ${memErr.message}`);
  }

  return {
    id: createdCompany.id,
    name: createdCompany.name,
    slug: createdCompany.slug,
    role: "owner",
  };
}