import "server-only";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WorksImportsPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Imports (Works)</h1>
      <p className="text-sm text-slate-500">
        TODO: denna sida byggs om. Använd Imports i vänstermenyn under tiden.
      </p>
      <Link className="text-sm underline" href="/c">
        Back
      </Link>
    </div>
  );
}