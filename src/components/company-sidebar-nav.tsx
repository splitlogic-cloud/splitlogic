"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
};

export default function CompanySidebarNav({
  companySlug,
}: {
  companySlug: string;
}) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { label: "Dashboard", href: `/c/${companySlug}/dashboard` },
    { label: "Imports", href: `/c/${companySlug}/imports` },
    { label: "Works", href: `/c/${companySlug}/works` },
    { label: "Parties", href: `/c/${companySlug}/parties` },
    { label: "Statements", href: `/c/${companySlug}/statements` },
    { label: "Audit", href: `/c/${companySlug}/audit` },
  ];

  return (
    <nav className="px-4 pb-6 pt-8">
      <div className="px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
        Navigation
      </div>

      <div className="mt-3 space-y-1.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition",
                isActive
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full transition",
                  isActive
                    ? "bg-cyan-500"
                    : "bg-slate-600 group-hover:bg-slate-400",
                ].join(" ")}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}