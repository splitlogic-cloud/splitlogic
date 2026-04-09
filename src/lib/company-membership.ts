import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseLike = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ErrorLike = { message?: string } | null | undefined;

export type CompanyMembership = {
  company_id: string;
  role: string | null;
};

type MembershipReadAttempt = {
  table: "company_memberships" | "memberships";
  userColumn: "user_id" | "profile_id";
};

const MEMBERSHIP_ATTEMPTS: MembershipReadAttempt[] = [
  { table: "company_memberships", userColumn: "user_id" },
  { table: "company_memberships", userColumn: "profile_id" },
  { table: "memberships", userColumn: "user_id" },
];

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asMessage(error: ErrorLike): string {
  return String(error?.message ?? "");
}

function isSchemaCompatibilityError(message: string): boolean {
  return (
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function toErr(message: string): { message: string } {
  return { message };
}

async function selectSingleMembership(
  supabase: SupabaseLike,
  attempt: MembershipReadAttempt,
  companyId: string,
  userId: string
): Promise<{ membership: CompanyMembership | null; errorMessage: string | null }> {
  const { data, error } = await supabase
    .from(attempt.table)
    .select("company_id, role")
    .eq("company_id", companyId)
    .eq(attempt.userColumn, userId)
    .maybeSingle();

  if (!error) {
    if (!data) return { membership: null, errorMessage: null };
    const row = data as Record<string, unknown>;
    const companyValue = asNullableString(row.company_id);
    if (!companyValue) return { membership: null, errorMessage: null };
    return {
      membership: {
        company_id: companyValue,
        role: asNullableString(row.role),
      },
      errorMessage: null,
    };
  }

  const message = asMessage(error);
  if (isSchemaCompatibilityError(message)) return { membership: null, errorMessage: null };
  return { membership: null, errorMessage: message };
}

async function listMembershipsForAttempt(
  supabase: SupabaseLike,
  attempt: MembershipReadAttempt,
  userId: string
): Promise<{ memberships: CompanyMembership[]; errorMessage: string | null }> {
  const { data, error } = await supabase
    .from(attempt.table)
    .select("company_id, role")
    .eq(attempt.userColumn, userId)
    .limit(5000);

  if (!error) {
    const rows = ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => ({
        company_id: asNullableString(row.company_id),
        role: asNullableString(row.role),
      }))
      .filter((row): row is CompanyMembership => Boolean(row.company_id));
    return { memberships: rows, errorMessage: null };
  }

  const message = asMessage(error);
  if (isSchemaCompatibilityError(message)) return { memberships: [], errorMessage: null };
  return { memberships: [], errorMessage: message };
}

async function resolveCompanyIdBySlug(
  supabase: SupabaseLike,
  companySlug: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

export async function findCompanyMembershipForUser(params: {
  supabase: SupabaseLike;
  companyId: string;
  userId: string;
}): Promise<CompanyMembership | null> {
  for (const attempt of MEMBERSHIP_ATTEMPTS) {
    const result = await selectSingleMembership(
      params.supabase,
      attempt,
      params.companyId,
      params.userId
    );
    if (result.errorMessage) throw new Error(result.errorMessage);
    if (result.membership) return result.membership;
  }
  return null;
}

export async function requireCompanyMembershipForUser(params: {
  supabase: SupabaseLike;
  companyId: string;
  userId: string;
}): Promise<CompanyMembership> {
  const membership = await findCompanyMembershipForUser(params);
  if (!membership) throw new Error("Not a member of this company");
  return membership;
}

export async function listCompanyMembershipsForUser(params: {
  supabase: SupabaseLike;
  userId: string;
}): Promise<CompanyMembership[]> {
  const merged = new Map<string, CompanyMembership>();

  for (const attempt of MEMBERSHIP_ATTEMPTS) {
    const result = await listMembershipsForAttempt(params.supabase, attempt, params.userId);
    if (result.errorMessage) throw new Error(result.errorMessage);

    for (const membership of result.memberships) {
      const current = merged.get(membership.company_id);
      if (!current || (!current.role && membership.role)) {
        merged.set(membership.company_id, membership);
      }
    }
  }

  return Array.from(merged.values());
}

// ---- Backwards-compatible exports used across the app ----

export async function getCompanyMembership(params: {
  companyId: string;
  userId: string;
  supabase?: SupabaseLike;
}): Promise<CompanyMembership | null> {
  const supabase = params.supabase ?? (await createSupabaseServerClient());
  return findCompanyMembershipForUser({
    supabase,
    companyId: params.companyId,
    userId: params.userId,
  });
}

export async function requireCompanyMembership(
  companyId: string,
  userId: string,
  supabaseArg?: SupabaseLike
): Promise<{ role: string | null }> {
  const supabase = supabaseArg ?? (await createSupabaseServerClient());
  const membership = await requireCompanyMembershipForUser({
    supabase,
    companyId,
    userId,
  });
  return { role: membership.role };
}

export async function getCompanyMembershipForUserByCompanyId(params: {
  companyId: string;
  userId: string;
  supabase?: SupabaseLike;
}): Promise<{ membership: { id: string; role: string | null } | null; error: { message: string } | null }> {
  try {
    const membership = await getCompanyMembership({
      companyId: params.companyId,
      userId: params.userId,
      supabase: params.supabase,
    });
    return {
      membership: membership ? { id: membership.company_id, role: membership.role } : null,
      error: null,
    };
  } catch (error) {
    return {
      membership: null,
      error: toErr(error instanceof Error ? error.message : "Unknown membership error"),
    };
  }
}

export async function resolveMembershipUserIdFields(
  supabase: SupabaseLike,
  userId: string
): Promise<"user_id" | "profile_id"> {
  const userFieldProbe = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1);
  if (!userFieldProbe.error) return "user_id";
  if (!isSchemaCompatibilityError(asMessage(userFieldProbe.error))) {
    throw new Error(userFieldProbe.error.message);
  }

  const profileFieldProbe = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("profile_id", userId)
    .limit(1);
  if (!profileFieldProbe.error) return "profile_id";
  if (!isSchemaCompatibilityError(asMessage(profileFieldProbe.error))) {
    throw new Error(profileFieldProbe.error.message);
  }

  return "user_id";
}

export async function getMembershipCompanyRows(
  supabase: SupabaseLike,
  userId: string,
  preferredUserField?: "user_id" | "profile_id"
): Promise<Array<{ id: string; slug: string | null; name: string | null; base_currency?: string | null }>> {
  const attempts: MembershipReadAttempt[] = preferredUserField
    ? [
        { table: "company_memberships", userColumn: preferredUserField },
        ...MEMBERSHIP_ATTEMPTS.filter(
          (a) => !(a.table === "company_memberships" && a.userColumn === preferredUserField)
        ),
      ]
    : MEMBERSHIP_ATTEMPTS;

  const byId = new Map<string, { id: string; slug: string | null; name: string | null; base_currency?: string | null }>();

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from(attempt.table)
      .select("companies:companies(id,slug,name,base_currency)")
      .eq(attempt.userColumn, userId)
      .limit(5000);

    if (error) {
      const message = asMessage(error);
      if (isSchemaCompatibilityError(message)) continue;
      throw new Error(message);
    }

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const company = (row.companies ?? null) as Record<string, unknown> | null;
      const id = asNullableString(company?.id);
      if (!id) continue;
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          slug: asNullableString(company?.slug),
          name: asNullableString(company?.name),
          base_currency: asNullableString(company?.base_currency),
        });
      }
    }
  }

  return Array.from(byId.values());
}

export async function listMembershipsForUser(
  userId: string
): Promise<{ memberships: Array<{ role: string | null; company: { id: string; name: string | null; base_currency: string | null } }>; error: { message: string } | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const memberships = await listCompanyMembershipsForUser({ supabase, userId });
    const companyRows = await getMembershipCompanyRows(supabase, userId);
    const companyById = new Map(companyRows.map((c) => [c.id, c]));

    const hydrated = memberships
      .map((membership) => {
        const company = companyById.get(membership.company_id);
        if (!company) return null;
        return {
          role: membership.role,
          company: {
            id: company.id,
            name: company.name,
            base_currency: company.base_currency ?? null,
          },
        };
      })
      .filter(
        (row): row is { role: string | null; company: { id: string; name: string | null; base_currency: string | null } } =>
          Boolean(row)
      );

    return { memberships: hydrated, error: null };
  } catch (error) {
    return {
      memberships: [],
      error: toErr(error instanceof Error ? error.message : "Unable to list memberships"),
    };
  }
}

export async function requireCompanyMembershipBySlug(params: {
  companySlug: string;
  userId: string;
  supabase?: SupabaseLike;
}): Promise<{ company: { id: string; slug: string }; membership: CompanyMembership }> {
  const supabase = params.supabase ?? (await createSupabaseServerClient());
  const companyId = await resolveCompanyIdBySlug(supabase, params.companySlug);
  if (!companyId) throw new Error("Company not found");

  const membership = await requireCompanyMembershipForUser({
    supabase,
    companyId,
    userId: params.userId,
  });

  return {
    company: { id: companyId, slug: params.companySlug },
    membership,
  };
}

export async function resolveMemberCompanyId(
  userId: string,
  scope: { companyId?: string; companySlug?: string }
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const companyId = scope.companyId?.trim()
    ? scope.companyId.trim()
    : scope.companySlug?.trim()
      ? await resolveCompanyIdBySlug(supabase, scope.companySlug.trim())
      : null;

  if (!companyId) return null;

  const membership = await findCompanyMembershipForUser({
    supabase,
    companyId,
    userId,
  });
  return membership ? companyId : null;
}
