"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type SidebarProps = {
  companySlug: string;
};

const navItems = [
  { label: "Dashboard", href: (slug: string) => `/c/${slug}/dashboard` },
  { label: "Imports", href: (slug: string) => `/c/${slug}/imports` },
  { label: "Works", href: (slug: string) => `/c/${slug}/works` },
  { label: "Parties", href: (slug: string) => `/c/${slug}/parties` },
  { label: "Statements", href: (slug: string) => `/c/${slug}/statements` },
  { label: "Audit", href: (slug: string) => `/c/${slug}/audit` },
];

export default function Sidebar({ companySlug }: SidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {navItems.map((item) => {
        const href = item.href(companySlug);

        const isActive =
          pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={item.label}
            href={href}
            className={clsx(
              "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
              isActive
                ? "bg-white text-slate-950 shadow-sm"
                : "text-white/90 hover:bg-white/10"
            )}
          >
            <span
              className={clsx(
                "h-2.5 w-2.5 rounded-full",
                isActive ? "bg-cyan-500" : "bg-slate-500"
              )}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}