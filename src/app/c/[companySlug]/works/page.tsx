import "server-only";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type WorkListRow = {
  id: string;
  title: string | null;
  external_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function WorksPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const { data: works, error: worksError } = await supabase
    .from("works")
    .select("id, title, external_id, created_at, updated_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (worksError) {
    throw new Error(`Failed to load works: ${worksError.message}`);
  }

  const rows = ((works ?? []) as WorkListRow[]).map((work) => ({
    ...work,
    title: work.title?.trim() || "Untitled work",
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Works</h1>
          <p className="text-sm text-slate-500">
            Catalog works for company: {companySlug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/works/new`}
          className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add work
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-4 border-b border-slate-200 px-6 py-4 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>Title</div>
          <div>External ID</div>
          <div>Created</div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-sm text-slate-500">
            <div>No works yet.</div>

            <Link
              href={`/c/${companySlug}/works/new`}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Create first work
            </Link>
          </div>
        ) : (
          rows.map((work) => (
            <div
              key={work.id}
              className="grid grid-cols-[1.5fr_1fr_1fr] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
            >
              <div>
                <Link
                  href={`/c/${companySlug}/works/${work.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {work.title}
                </Link>
              </div>

              <div className="break-all text-sm text-slate-600">
                {work.external_id || "—"}
              </div>

              <div className="text-sm text-slate-600">
                {work.created_at
                  ? new Date(work.created_at).toISOString().slice(0, 10)
                  : "—"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}