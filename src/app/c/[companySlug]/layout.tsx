import "server-only";
import Link from "next/link";
import CompanySidebarNav from "@/components/company-sidebar-nav";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid min-h-screen grid-cols-[280px_1fr]">
        <aside className="relative border-r border-white/10 bg-[linear-gradient(180deg,#041127_0%,#020817_100%)] text-white">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-400/20">
                  <div className="h-6 w-6 rounded-lg bg-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.35)]" />
                </div>

                <div>
                  <div className="text-[22px] font-semibold tracking-tight">
                    SplitLogic
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70">
                    Royalty Engine
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 pt-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                  Active company
                </div>

                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[19px] font-semibold tracking-tight text-white">
                      {companySlug}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-400">
                      SplitLogic workspace
                    </div>
                  </div>

                  <Link
                    href="/select-company"
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                  >
                    <span className="text-xs">▶</span>
                    Switch
                  </Link>
                </div>
              </div>
            </div>

            <CompanySidebarNav companySlug={companySlug} />

            <div className="mt-auto px-5 pb-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                <div className="font-medium text-slate-200">System status</div>
                <div className="mt-1">App shell active</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="bg-slate-50">
          <div className="mx-auto max-w-7xl p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}