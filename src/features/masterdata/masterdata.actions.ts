"use server";

import { createClient } from "@/lib/supabase/server";

type MembershipContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
  company: { id: string; slug: string };
  membership: { id: string; role: string | null };
};

async function requireCompanyMembershipBySlug(
  companySlug: string
): Promise<MembershipContext> {
  if (!companySlug || typeof companySlug !== "string") {
    throw new Error("requireCompanyMembershipBySlug: missing companySlug");
  }

  const supabase = await createClient();

  // Auth
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  const user = authData?.user;
  if (!user) throw new Error("Not authenticated");

  // Company lookup (RLS-safe; assumes companies are visible to members or public)
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug.trim())
    .maybeSingle();

  if (companyErr) throw new Error(companyErr.message);
  if (!company) throw new Error("Company not found");

  // Membership enforce (RLS-safe)
  const { data: membership, error: memErr } = await supabase
    .from("memberships")
    .select("id, role")
    .eq("company_id", company.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr) throw new Error(memErr.message);
  if (!membership) throw new Error("Not a member of this company");

  return {
    supabase,
    user: { id: user.id },
    company,
    membership,
  };
}

async function requireImportJobBelongsToCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  importId: string
) {
  if (!importId || typeof importId !== "string") {
    throw new Error("Missing importId");
  }

  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .select("id, company_id, status")
    .eq("id", importId)
    .maybeSingle();

  if (jobErr) throw new Error(jobErr.message);
  if (!job) throw new Error("Import job not found");
  if (job.company_id !== companyId) {
    throw new Error("Import job belongs to another company");
  }

  return job;
}

export async function applyMasterdataAction(
  companySlug: string,
  importId: string
) {
  const { supabase, company } = await requireCompanyMembershipBySlug(companySlug);

  const job = await requireImportJobBelongsToCompany(supabase, company.id, importId);

  // Optional guard (feel free to relax)
  if (job.status !== "parsed" && job.status !== "undone") {
    throw new Error(`Import job not applyable from status=${job.status}`);
  }

  // IMPORTANT: RPC param name must match function signature (p_import_id)
  const { error } = await supabase.rpc("apply_masterdata", {
    p_import_id: importId,
  });

  if (error) throw new Error(error.message);

  return { ok: true };
}

export async function undoMasterdataAction(
  companySlug: string,
  importId: string
) {
  const { supabase, company } = await requireCompanyMembershipBySlug(companySlug);

  const job = await requireImportJobBelongsToCompany(supabase, company.id, importId);

  // Optional guard (feel free to relax)
  if (job.status !== "applied") {
    throw new Error(`Import job not undoable from status=${job.status}`);
  }

  // IMPORTANT: RPC param name must match function signature (p_import_id)
  const { error } = await supabase.rpc("undo_masterdata", {
    p_import_id: importId,
  });

  if (error) throw new Error(error.message);

  return { ok: true };
}