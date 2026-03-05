import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyBySlugForUser, listMyCompanies } from "@/features/companies/companies.repo";

export const dynamic = "force-dynamic";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params; // ✅ Next 16: params is Promise

  const active = await requireCompanyBySlugForUser(companySlug);
  const companies = await listMyCompanies();

  // safety: if slug exists but user no longer has membership, bounce to select-company
  if (!active?.id) redirect("/select-company");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 bg-slate-950 text-slate-100">
          <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
            <div className="h-9 w-9 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <div className="h-5 w-5 rounded bg-sky-500" />
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">SplitLogic</div>
              <div className="text-xs text-slate-400">ROYALTY ENGINE</div>
            </div>
          </div>

          {/* Company switch */}
          <div className="px-4 py-4">
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
              <div className="text-xs text-slate-400">Active company</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{active.name ?? active.slug}</div>
                  <div className="text-xs text-slate-400 truncate">{active.slug}</div>
                </div>

                {/* Simple dropdown via <details> */}
                <details className="relative">
                  <summary className="cursor-pointer select-none text-xs px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700">
                    Switch
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-950 shadow-lg overflow-hidden z-50">
                    <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-800">
                      Your companies
                    </div>
                    <div className="max-h-64 overflow-auto">
                      {companies.map((c) => (
                        <Link
                          key={c.id}
                          href={`/c/${c.slug}/dashboard`}
                          className={`block px-3 py-2 text-sm hover:bg-slate-900 ${
                            c.slug === active.slug ? "bg-slate-900" : ""
                          }`}
                        >
                          <div className="font-medium truncate">{c.name ?? c.slug}</div>
                          <div className="text-xs text-slate-400 truncate">{c.slug}</div>
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-slate-800">
                      <Link href="/select-company" className="block px-3 py-2 text-sm hover:bg-slate-900">
                        Manage companies →
                      </Link>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="px-3 py-2 text-sm">
            <div className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500">Navigation</div>
            <NavLink href={`/c/${active.slug}/dashboard`} label="Dashboard" />
            <NavLink href={`/c/${active.slug}/imports`} label="Imports" />
            <NavLink href={`/c/${active.slug}/works`} label="Works" />
            <NavLink href={`/c/${active.slug}/parties`} label="Parties" />
            <NavLink href={`/c/${active.slug}/statements`} label="Statements" />
            <NavLink href={`/c/${active.slug}/audit`} label="Audit" />
          </nav>

          <div className="mt-auto px-5 py-4 text-xs text-slate-500 border-t border-slate-800">
            Engine v1.1 · Active
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 md:pl-72">
          <div className="md:hidden h-14 flex items-center justify-between px-4 border-b border-slate-200 bg-white">
            <div className="font-semibold">SplitLogic</div>
            <Link href="/select-company" className="text-xs px-2 py-1 rounded-md border border-slate-200">
              Company
            </Link>
          </div>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl px-3 py-2 text-slate-200 hover:bg-slate-900 hover:text-white transition"
    >
      {label}
    </Link>
  );
}