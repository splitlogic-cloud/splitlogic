import "server-only";

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  importJobId: string;
  companySlug: string;
};

type ReviewRow = {
  id: string;
  row_number: number | null;
  status: string | null;
  raw_title: string | null;
  matched_work_id: string | null;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
};

export default async function MatchReviewTable({
  importJobId,
  companySlug,
}: Props) {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("id,row_number,status,raw_title,matched_work_id,currency,net_amount,gross_amount")
    .eq("import_job_id", importJobId)
    .in("status", ["needs_review", "unmatched", "matched"])
    .order("row_number", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load match review rows: ${error.message}`);
  }

  const rows = (data ?? []) as ReviewRow[];

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">Match review</div>
        <p className="mt-2 text-sm text-neutral-600">No rows need review.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b p-4">
        <div className="text-sm font-medium">Match review</div>
        <p className="mt-1 text-sm text-neutral-600">
          Review matched / unmatched rows before allocation.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Work</th>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2">Net</th>
              <th className="px-3 py-2">Gross</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.row_number ?? "-"}</td>
                <td className="px-3 py-2">{row.raw_title ?? "-"}</td>
                <td className="px-3 py-2">{row.status ?? "-"}</td>
                <td className="px-3 py-2">
                  {row.matched_work_id ? (
                    <Link
                      href={`/c/${companySlug}/works/${row.matched_work_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {row.matched_work_id}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2">{row.currency ?? "-"}</td>
                <td className="px-3 py-2">{row.net_amount ?? "-"}</td>
                <td className="px-3 py-2">{row.gross_amount ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}