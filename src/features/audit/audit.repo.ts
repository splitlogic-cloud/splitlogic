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

function isMissingSchemaEntity(message: string, entities: string[]): boolean {
  const normalized = message.toLowerCase();
  if (
    !normalized.includes("does not exist") &&
    !normalized.includes("could not find the") &&
    !normalized.includes("schema cache")
  ) {
    return false;
  }
  return entities.some((entity) => normalized.includes(entity.toLowerCase()));
}

export async function createAuditEvent(params: {
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  payload?: Record<string, unknown> | null;
  createdBy?: string | null;
}) {
  const attempts = [
    {
      table: "audit_events",
      payload: {
        company_id: params.companyId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        payload: params.payload ?? null,
        created_by: params.createdBy ?? null,
      },
    },
    {
      table: "audit_events",
      payload: {
        company_id: params.companyId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        payload: params.payload ?? null,
      },
    },
    {
      table: "audit_log",
      payload: {
        company_id: params.companyId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        payload: params.payload ?? null,
      },
    },
  ] as const;

  for (const attempt of attempts) {
    const { error } = await supabaseAdmin.from(attempt.table).insert(attempt.payload);
    if (!error) {
      return;
    }
    if (
      isMissingSchemaEntity(error.message, [
        "audit_events",
        "audit_log",
        "created_by",
        "payload",
        "entity_type",
        "entity_id",
      ])
    ) {
      continue;
    }
    throw new Error(`createAuditEvent failed: ${error.message}`);
  }
}

export async function listAuditEventsByCompany(params: {
  companyId: string;
  limit?: number;
}): Promise<AuditEventRow[]> {
  const attempts = [
    {
      table: "audit_events",
      select: "id, company_id, entity_type, entity_id, action, payload, created_at, created_by",
      mapRow: (row: Record<string, unknown>) => ({
        id: String(row.id),
        company_id: String(row.company_id),
        entity_type: String(row.entity_type ?? ""),
        entity_id: String(row.entity_id ?? ""),
        action: String(row.action ?? ""),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null,
        created_at: String(row.created_at ?? ""),
        created_by: row.created_by == null ? null : String(row.created_by),
      }),
    },
    {
      table: "audit_events",
      select: "id, company_id, entity_type, entity_id, action, payload, created_at",
      mapRow: (row: Record<string, unknown>) => ({
        id: String(row.id),
        company_id: String(row.company_id),
        entity_type: String(row.entity_type ?? ""),
        entity_id: String(row.entity_id ?? ""),
        action: String(row.action ?? ""),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null,
        created_at: String(row.created_at ?? ""),
        created_by: null,
      }),
    },
    {
      table: "audit_log",
      select: "id, company_id, entity_type, entity_id, action, payload, created_at, created_by",
      mapRow: (row: Record<string, unknown>) => ({
        id: String(row.id),
        company_id: String(row.company_id),
        entity_type: String(row.entity_type ?? ""),
        entity_id: String(row.entity_id ?? ""),
        action: String(row.action ?? ""),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null,
        created_at: String(row.created_at ?? ""),
        created_by: row.created_by == null ? null : String(row.created_by),
      }),
    },
    {
      table: "audit_log",
      select: "id, company_id, entity_type, entity_id, action, payload, created_at",
      mapRow: (row: Record<string, unknown>) => ({
        id: String(row.id),
        company_id: String(row.company_id),
        entity_type: String(row.entity_type ?? ""),
        entity_id: String(row.entity_id ?? ""),
        action: String(row.action ?? ""),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null,
        created_at: String(row.created_at ?? ""),
        created_by: null,
      }),
    },
  ] as const;

  for (const attempt of attempts) {
    const { data, error } = await supabaseAdmin
      .from(attempt.table)
      .select(attempt.select)
      .eq("company_id", params.companyId)
      .order("created_at", { ascending: false })
      .limit(params.limit ?? 200);

    if (!error) {
      const rows = (data ?? []) as unknown[];
      return rows.map((row) => attempt.mapRow((row ?? {}) as Record<string, unknown>));
    }

    if (
      isMissingSchemaEntity(error.message, [
        "audit_events",
        "audit_log",
        "created_by",
        "payload",
        "entity_type",
        "entity_id",
      ])
    ) {
      continue;
    }

    throw new Error(`listAuditEventsByCompany failed: ${error.message}`);
  }

  return [];
}

export async function listAuditEventsForEntity(params: {
  companyId: string;
  entityType: string;
  entityId: string;
  limit?: number;
}): Promise<AuditEventRow[]> {
  const attempts = [
    {
      table: "audit_events",
      select: "id, company_id, entity_type, entity_id, action, payload, created_at, created_by",
      mapRow: (row: Record<string, unknown>) => ({
        id: String(row.id),
        company_id: String(row.company_id),
        entity_type: String(row.entity_type ?? ""),
        entity_id: String(row.entity_id ?? ""),
        action: String(row.action ?? ""),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null,
        created_at: String(row.created_at ?? ""),
        created_by: row.created_by == null ? null : String(row.created_by),
      }),
    },
    {
      table: "audit_events",
      select: "id, company_id, entity_type, entity_id, action, payload, created_at",
      mapRow: (row: Record<string, unknown>) => ({
        id: String(row.id),
        company_id: String(row.company_id),
        entity_type: String(row.entity_type ?? ""),
        entity_id: String(row.entity_id ?? ""),
        action: String(row.action ?? ""),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null,
        created_at: String(row.created_at ?? ""),
        created_by: null,
      }),
    },
    {
      table: "audit_log",
      select: "id, company_id, entity_type, entity_id, action, payload, created_at, created_by",
      mapRow: (row: Record<string, unknown>) => ({
        id: String(row.id),
        company_id: String(row.company_id),
        entity_type: String(row.entity_type ?? ""),
        entity_id: String(row.entity_id ?? ""),
        action: String(row.action ?? ""),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null,
        created_at: String(row.created_at ?? ""),
        created_by: row.created_by == null ? null : String(row.created_by),
      }),
    },
    {
      table: "audit_log",
      select: "id, company_id, entity_type, entity_id, action, payload, created_at",
      mapRow: (row: Record<string, unknown>) => ({
        id: String(row.id),
        company_id: String(row.company_id),
        entity_type: String(row.entity_type ?? ""),
        entity_id: String(row.entity_id ?? ""),
        action: String(row.action ?? ""),
        payload:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null,
        created_at: String(row.created_at ?? ""),
        created_by: null,
      }),
    },
  ] as const;

  for (const attempt of attempts) {
    const { data, error } = await supabaseAdmin
      .from(attempt.table)
      .select(attempt.select)
      .eq("company_id", params.companyId)
      .eq("entity_type", params.entityType)
      .eq("entity_id", params.entityId)
      .order("created_at", { ascending: false })
      .limit(params.limit ?? 100);

    if (!error) {
      const rows = (data ?? []) as unknown[];
      return rows.map((row) => attempt.mapRow((row ?? {}) as Record<string, unknown>));
    }

    if (
      isMissingSchemaEntity(error.message, [
        "audit_events",
        "audit_log",
        "created_by",
        "payload",
        "entity_type",
        "entity_id",
      ])
    ) {
      continue;
    }

    throw new Error(`listAuditEventsForEntity failed: ${error.message}`);
  }

  return [];
}