import Link from "next/link";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: any;
}) {
  const companySlug = (await params)?.companySlug ?? (await params)?.slug ?? (await params)?.company;

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r border-slate-200 p-4 space-y-2">
        <div className="font-semibold text-lg mb-3">SplitLogic</div>
        <Nav href={`/c/${companySlug}/dashboard`} label="Dashboard" />
        <Nav href={`/c/${companySlug}/masterdata`} label="Masterdata" />
        <Nav href={`/c/${companySlug}/imports`} label="Imports" />
        <Nav href={`/c/${companySlug}/works`} label="Works" />
        <Nav href={`/c/${companySlug}/allocations`} label="Allocations" />
      </aside>

      <main className="flex-1">{children}</main>
    </div>
  );
}

function Nav({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-xl hover:bg-slate-100 text-sm"
    >
      {label}
    </Link>
  );
}