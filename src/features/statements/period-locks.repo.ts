import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";

export type StatementPeriodLockRow = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  allocation_run_id: string | null;
  locked_at: string;
  locked_by: string | null;
};

export async function listStatementPeriodLocks(params: {
  companyId: string;
}): Promise<StatementPeriodLockRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statement_period_locks")
    .select("*")
    .eq("company_id", params.companyId)
    .order("locked_at", { ascending: false });

  if (error) {
    throw new Error(`listStatementPeriodLocks failed: ${error.message}`);
  }

  return (data ?? []) as StatementPeriodLockRow[];
}

export async function isPeriodLocked(params: {
  companyId: string;
  periodStart: string | null | undefined;
  periodEnd: string | null | undefined;
}): Promise<boolean> {
  if (!params.periodStart || !params.periodEnd) return false;

  const { data, error } = await supabaseAdmin
    .from("statement_period_locks")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("period_start", params.periodStart)
    .eq("period_end", params.periodEnd)
    .maybeSingle();

  if (error) {
    throw new Error(`isPeriodLocked failed: ${error.message}`);
  }

  return !!data;
}

export async function lockStatementPeriod(params: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  allocationRunId?: string | null;
  lockedBy?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("statement_period_locks")
    .upsert(
      {
        company_id: params.companyId,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        allocation_run_id: params.allocationRunId ?? null,
        locked_by: params.lockedBy ?? null,
      },
      {
        onConflict: "company_id,period_start,period_end",
      }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`lockStatementPeriod failed: ${error?.message ?? "no row"}`);
  }

  await createAuditEvent({
    companyId: params.companyId,
    entityType: "statement_period_lock",
    entityId: String(data.id),
    action: "statement.period.locked",
    payload: {
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      allocationRunId: params.allocationRunId ?? null,
    },
    createdBy: params.lockedBy ?? null,
  });

  return String(data.id);
}