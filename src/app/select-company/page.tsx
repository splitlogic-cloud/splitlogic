import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateCompanyClient from "./ui/CreateCompanyClient";

export const dynamic = "force-dynamic";

type MyCompany = {
  id: string;
  name: string;
  slug: string;
  role?: string | null;
};

export default async function SelectCompanyPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw new Error(userErr.message);
  if (!user) redirect("/login");

  /**
   * Försök läsa användarens companies via membership-tabellen.
   * Anpassa tabellnamn/kolumner om din schema skiljer sig.
   *
   * Antagande:
   * - company_memberships: user_id, company_id, role
   * - companies: id, name, slug
   */
  const { data, error } = await supabase
    .from("company_memberships")
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
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  const companies: MyCompany[] =
    (data ?? [])
      .map((m: any) => {
        const c = Array.isArray(m.companies) ? m.companies[0] : m.companies;
        if (!c?.id) return null;
        return {
          id: String(c.id),
          name: String(c.name ?? ""),
          slug: String(c.slug ?? ""),
          role: m.role ?? null,
        } satisfies MyCompany;
      })
      .filter(Boolean) as MyCompany[];

  if (companies.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h1 className="text-xl font-semibold">No companies</h1>
          <p className="text-sm text-slate-600">
            You don’t seem to have access to any companies yet.
          </p>
          <div className="flex items-center justify-end">
            <CreateCompanyClient />
          </div>
        </div>
      </div>
    );
  }

  // Välj eller skapa bolag
  return (
    <div className="min-h-[60vh] p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Select company</h1>
          <p className="text-sm text-slate-600">
            Choose which company you want to open.
          </p>
        </div>

        <div className="flex items-center justify-end">
          <CreateCompanyClient />
        </div>

        <div className="grid gap-3">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/c/${c.slug}/dashboard`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50 transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    • slug: <span className="font-mono">{c.slug}</span> • role:{" "}
                    <span className="font-mono">{c.role ?? "member"}</span>
                  </div>
                </div>
                <div className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white">
                  Open
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-xs text-slate-500">
          (You can change company later via the company switcher.)
        </div>
      </div>
    </div>
  );
}