import Link from "next/link";

type Props = {
  title: string;
  children: React.ReactNode;
  companySlug: string;
  active?: string;
  right?: React.ReactNode;
};

export function AppShell({ title, children, companySlug, active, right }: Props) {
  const base = `/c/${companySlug}`;

  const nav = [
    { href: `${base}/dashboard`, label: "Dashboard" },
    { href: `${base}/imports`, label: "Imports" },
    { href: `${base}/works`, label: "Works" },
    { href: `${base}/parties`, label: "Parties" },
    { href: `${base}/statements`, label: "Statements" },
    { href: `${base}/audit`, label: "Audit" },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-slate-950 to-slate-900 text-white p-6 flex flex-col">
        <div className="mb-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
            <div className="h-5 w-7 rounded bg-gradient-to-r from-cyan-300 to-violet-300" />
          </div>
          <div>
            <div className="text-lg font-semibold leading-tight">SplitLogic</div>
            <div className="text-xs text-slate-400">Royalty engine</div>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          {nav.map((item) => {
            const isActive = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block rounded-xl px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:text-white hover:bg-white/5",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} SplitLogic
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 bg-slate-50 p-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <div className="text-xs text-slate-500 mt-1">
              Active company: <span className="font-medium text-slate-800">{companySlug}</span>
            </div>
          </div>
          <div>{right}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          {children}
        </div>
      </main>
    </div>
  );
}