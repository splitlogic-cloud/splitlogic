import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateCompanyClient from "./ui/CreateCompanyClient";
import CompanyActionsMenu from "./ui/CompanyActionsMenu";

export const dynamic = "force-dynamic";

type MyCompany = {
  id: string;
  name: string;
  slug: string;
  role?: string | null;
};

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

async function loadCompaniesForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<MyCompany[]> {
  const attempts = [
    { table: "company_memberships", userColumn: "user_id" },
    { table: "company_memberships", userColumn: "profile_id" },
    { table: "memberships", userColumn: "user_id" },
    { table: "memberships", userColumn: "profile_id" },
  ] as const;

  const byId = new Map<string, MyCompany>();

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from(attempt.table)
      .select(
        `
      role,
      companies:companies (
        id,
        name,
        slug
      )
    `
      )
      .eq(attempt.userColumn, userId);

    if (error) {
      if (isSchemaCompatibilityError(error.message)) {
        continue;
      }
      throw new Error(error.message);
    }

    for (const membership of (data ?? []) as Array<Record<string, unknown>>) {
      const companyRaw = (membership.companies ?? null) as
        | Record<string, unknown>
        | Array<Record<string, unknown>>
        | null;
      const company = Array.isArray(companyRaw) ? companyRaw[0] : companyRaw;
      if (!company?.id) continue;
      const id = String(company.id);

      if (!byId.has(id)) {
        byId.set(id, {
          id,
          name: String(company.name ?? ""),
          slug: String(company.slug ?? ""),
          role: membership.role ? String(membership.role) : null,
        });
      }
    }
  }

  return Array.from(byId.values());
}

export default async function SelectCompanyPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error(userErr.message);
  if (!user) redirect("/login");

  const companies = await loadCompaniesForUser(supabase, user.id);

  if (companies.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
          <h1 className="text-xl font-semibold">No companies</h1>
          <p className="text-sm text-slate-600">
            You don’t seem to have access to any companies yet.
          </p>
          <div className="text-sm">
            <Link className="underline" href="/onboarding">
              Go to onboarding
            </Link>
          </div>
          <div className="pt-1">
            <CreateCompanyClient />
          </div>
        </div>
      </div>
    );
  }

  // Om bara en company: skicka direkt
  if (companies.length === 1) {
    redirect(`/c/${companies[0].slug}/dashboard`);
  }

  // Annars välj
  return (
    <div className="min-h-[60vh] p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Select company</h1>
            <p className="text-sm text-slate-600">
              Choose which company you want to open.
            </p>
          </div>
          <CreateCompanyClient />
        </div>

        <div className="grid gap-3">
          {companies.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-4">
                <Link href={`/c/${c.slug}/dashboard`} className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    • slug: <span className="font-mono">{c.slug}</span> • role:{" "}
                    <span className="font-mono">{c.role ?? "member"}</span>
                  </div>
                </Link>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/c/${c.slug}/dashboard`}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white"
                  >
                    Open
                  </Link>
                  <CompanyActionsMenu
                    companyId={c.id}
                    currentName={c.name}
                    currentSlug={c.slug}
                    canManage={(c.role ?? "member").toLowerCase() !== "member"}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-slate-500">
          (You can change company later via the company switcher.)
        </div>
      </div>
    </div>
  );
}