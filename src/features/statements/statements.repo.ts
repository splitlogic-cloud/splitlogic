import "server-only";

import { createClient } from "@/lib/supabase/server";

export type StatementStatus = "draft" | "sent" | "paid" | "void" | "voided";

export type StatementRow = {
  id: string;
  company_id: string;
  party_id?: string | null;

  period_start?: string | null;
  period_end?: string | null;

  status?: StatementStatus | null;

  currency?: string | null;
  note?: string | null;

  created_at?: string | null;
};

export type StatementLineRow = {
  id: string;
  statement_id: string;

  party_id?: string | null;
  party_name?: string | null;

  release_id?: string | null;
  release_title?: string | null;

  work_id?: string | null;
  work_title?: string | null;

  source_amount?: number | null;      // 🔥 FIX
  share_percent?: number | null;
  allocated_amount?: number | null;

  currency?: string | null;

  created_at?: string | null;
};

export async function getStatementWithLines(statementId: string) {
  const supabase = await createClient();

  const { data: header, error: headerError } = await supabase
    .from("statements")
    .select(`
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      note,
      created_at
    `)
    .eq("id", statementId)
    .maybeSingle();

  if (headerError) {
    throw new Error(headerError.message);
  }

  if (!header) {
    throw new Error("Statement not found");
  }

  const { data: lines, error: linesError } = await supabase
    .from("statement_lines")
    .select(`
      id,
      statement_id,
      party_id,
      release_id,
      release_title,
      work_id,
      work_title,
      source_amount,
      share_percent,
      allocated_amount,
      currency,
      created_at
    `)
    .eq("statement_id", statementId)
    .order("created_at", { ascending: true });

  if (linesError) {
    throw new Error(linesError.message);
  }

  return {
    header: header as StatementRow,
    lines: (lines ?? []) as StatementLineRow[],
  };
}