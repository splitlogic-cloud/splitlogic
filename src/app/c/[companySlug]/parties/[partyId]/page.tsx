import "server-only";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PartyDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; partyId: string }>;
}) {
  const { companySlug, partyId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Party</h1>
        <p className="text-sm text-slate-500">
          Party detail page for company: {companySlug}
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-500">Party ID</div>
        <div className="mt-2 text-lg font-medium text-slate-900">{partyId}</div>

        <p className="mt-4 text-sm text-slate-500">
          Detailed editing for parties is not wired in yet.
        </p>

        <div className="mt-6">
          <Link
            href={`/c/${companySlug}/parties`}
            className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to parties
          </Link>
        </div>
      </div>
    </div>
  );
}