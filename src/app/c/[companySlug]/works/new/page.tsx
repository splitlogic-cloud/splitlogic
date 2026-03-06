import "server-only";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewWorkPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New work</h1>
        <p className="text-sm text-slate-500">
          Create work flow for company: {companySlug}
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Work creation form is not wired in yet.
        </p>

        <div className="mt-6">
          <Link
            href={`/c/${companySlug}/works`}
            className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to works
          </Link>
        </div>
      </div>
    </div>
  );
}