// src/app/c/[companySlug]/statements/page.tsx
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import StatementsListClient from "./ui/StatementsListClient";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
};

export default async function StatementsPage(props: {
  params: { companySlug: string } | { companySlug: string };
  searchParams?: { status?: string; q?: string } | { status?: string; q?: string };
}) {
  const params = props.params;
  const searchParams = (props.searchParams ?? {});
  const companySlug = params.companySlug;

  const supabase = await createSupabaseServerClient();
  const company = await requireCompanyBySlugForUser(companySlug);

  const status = (searchParams.status ?? "").trim(); // "" | draft | sent | paid | void
  const q = (searchParams.q ?? "").trim();

  // Minimal list from statements table (works with your schema)
  let query = supabase
    .from("statements")
    .select("id,status,created_at,sent_at,paid_at,voided_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  // If you want search, you can later add note search if you have note column
  if (q) query = query.ilike("note", `%${q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
          <p className="text-sm text-slate-500">
            Perioder och utbetalningsunderlag per part. Revisionssäkert med låsning.
          </p>
        </div>
      </div>

      <StatementsListClient
        companySlug={company.slug}
        initialRows={rows}
        initialStatus={status}
        initialQ={q}
      />
    </div>
  );
}