import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

export default async function ReportRedirectPage({ params }: PageProps) {
  const { companySlug } = await params;
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load company reports: ${error.message}`);
  }

  if (!company) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-neutral-500">
          <Link href={`/c/${companySlug}/dashboard`} className="underline">
            Dashboard
          </Link>{" "}
          / Reports
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Central entry point for report-related views for{" "}
          {company.name ?? company.slug}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/c/${companySlug}/works/coverage`}
          className="rounded-2xl border bg-white p-5 transition hover:bg-neutral-50"
        >
          <div className="text-sm font-medium">Works coverage</div>
          <div className="mt-1 text-sm text-neutral-600">
            Split coverage and blockers for allocation quality.
          </div>
        </Link>

        <Link
          href={`/c/${companySlug}/statements`}
          className="rounded-2xl border bg-white p-5 transition hover:bg-neutral-50"
        >
          <div className="text-sm font-medium">Statements</div>
          <div className="mt-1 text-sm text-neutral-600">
            Statement list, QA status, and exports.
          </div>
        </Link>
      </div>
    </div>
  );
}
