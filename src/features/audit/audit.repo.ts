import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type AuditEventRow = {
  id: string;
  company_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
};

export async function createAuditEvent(params: {
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  payload?: Record<string, unknown> | null;
  createdBy?: string | null;
}) {
  const { error } = await supabaseAdmin.from("audit_events").insert({
    company_id: params.companyId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    payload: params.payload ?? null,
    created_by: params.createdBy ?? null,
  });

  if (error) {
    throw new Error(`createAuditEvent failed: ${error.message}`);
  }
}

export async function listAuditEventsByCompany(params: {
  companyId: string;
  limit?: number;
}): Promise<AuditEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("audit_events")
    .select("*")
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 200);

  if (error) {
    throw new Error(`listAuditEventsByCompany failed: ${error.message}`);
  }

  return (data ?? []) as AuditEventRow[];
}

export async function listAuditEventsForEntity(params: {
  companyId: string;
  entityType: string;
  entityId: string;
  limit?: number;
}): Promise<AuditEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("audit_events")
    .select("*")
    .eq("company_id", params.companyId)
    .eq("entity_type", params.entityType)
    .eq("entity_id", params.entityId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 100);

  if (error) {
    throw new Error(`listAuditEventsForEntity failed: ${error.message}`);
  }

  return (data ?? []) as AuditEventRow[];
}