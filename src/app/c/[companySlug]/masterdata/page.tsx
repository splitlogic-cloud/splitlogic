import Link from "next/link";
import MasterdataActions from "@/features/masterdata/MasterdataActions";
import { createClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export default async function MasterdataPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  const supabase = await createClient();

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Masterdata</h1>
        <div className="mt-4 rounded-md border p-3 text-sm">
          Auth error: {authErr.message}
        </div>
      </div>
    );
  }

  const user = authData?.user;
  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Masterdata</h1>
        <div className="mt-4 rounded-md border p-3 text-sm">
          Not authenticated
        </div>
      </div>
    );
  }

  const company = await requireCompanyBySlugForUser(companySlug);

  const { data: membership, error: memErr } = await supabase
    .from("memberships")
    .select("id, role")
    .eq("company_id", company.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Masterdata</h1>
        <div className="mt-4 rounded-md border p-3 text-sm">
          Membership error: {memErr.message}
        </div>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Masterdata</h1>
        <div className="mt-4 rounded-md border p-3 text-sm">
          Not a member of this company
        </div>
      </div>
    );
  }

  const { data: latest, error: latestErr } = await supabase
    .from("import_jobs")
    .select("id,status,created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Masterdata</h1>
        <div className="mt-4 rounded-md border p-3 text-sm">
          Latest import error: {latestErr.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Masterdata</h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload and manage masterdata imports for {companySlug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/masterdata/upload`}
          className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New import
        </Link>
      </div>

      {!latest ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-base font-medium text-slate-900">
            No imports yet
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Start by uploading your first masterdata file.
          </p>

          <div className="mt-5">
            <Link
              href={`/c/${companySlug}/masterdata/upload`}
              className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Upload first file
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2 text-sm">
            <div>
              <span className="opacity-70">Latest import ID:</span> {latest.id}
            </div>
            <div>
              <span className="opacity-70">Status:</span> {latest.status}
            </div>
            <div>
              <span className="opacity-70">Created:</span>{" "}
              {new Date(latest.created_at).toLocaleString()}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <MasterdataActions
              companySlug={companySlug}
              importId={latest.id}
              status={latest.status}
            />
          </div>
        </div>
      )}
    </div>
  );
}