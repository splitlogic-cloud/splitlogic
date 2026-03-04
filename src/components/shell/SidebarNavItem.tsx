// src/components/shell/SidebarNavItem.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Icon({ name }: { name: string }) {
  const cls = "h-4 w-4 opacity-90";
  // super-light icons (ingen extra dependency)
  switch (name) {
    case "grid":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none">
          <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "download":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none">
          <path d="M12 3v10m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17v3h16v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "wave":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none">
          <path d="M3 12c3-8 6 8 9 0s6 8 9 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "users":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none">
          <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 21c1.5-4 14.5-4 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "file":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none">
          <path d="M7 3h7l3 3v15H7V3Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "shield":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none">
          <path d="M12 3 20 7v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    default:
      return <span className="inline-block w-4" />;
  }
}

export default function NavItem({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: string;
  badge?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname?.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition",
        active
          ? "bg-[#06293C] text-white border border-[#00C2FF]/25 shadow-[0_0_0_1px_rgba(0,194,255,0.08)_inset]"
          : "text-white/70 hover:text-white hover:bg-white/5",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span className={active ? "text-[#00C2FF]" : "text-white/60"}>
          <Icon name={icon} />
        </span>
        <span className={active ? "font-medium" : ""}>{label}</span>
      </div>

      {badge ? (
        <span className="ml-3 inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}