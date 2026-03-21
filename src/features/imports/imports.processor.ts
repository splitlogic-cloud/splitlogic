import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

type CanonicalImportRow = {
  id: string;
  import_id: string | null;
  import_job_id: string | null;
  raw: Record<string, unknown> | null;
  normalized: Record<string, unknown> | null;
  canonical: Record<string, unknown> | null;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  matched_work_id: string | null;
  status: string | null;
};

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;

  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/,/g, ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function pick<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return null;
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getField(obj: Record<string, unknown> | null, keys: string[]): unknown {
  if (!obj) return null;

  for (const key of keys) {
    if (obj[key] != null && obj[key] !== "") {
      return obj[key];
    }
  }

  return null;
}

function buildCanonicalRow(row: CanonicalImportRow) {
  const raw = getObject(row.raw);
  const normalized = getObject(row.normalized);
  const canonical = getObject(row.canonical);

  const currency = asString(
    pick(
      row.currency,
      getField(canonical, ["currency"]),
      getField(normalized, ["currency"]),
      getField(raw, ["currency", "Currency", "ACCOUNT CURRENCY"])
    )
  );

  const netAmount = asNumber(
    pick(
      row.net_amount,
      getField(canonical, ["net_amount", "amount"]),
      getField(normalized, ["net_amount", "amount"]),
      getField(raw, ["net_amount", "amount", "Amount", "NET SHARE ACCOUNT CURRENCY"])
    )
  );

  const grossAmount = asNumber(
    pick(
      row.gross_amount,
      getField(canonical, ["gross_amount"]),
      getField(normalized, ["gross_amount"]),
      getField(raw, ["gross_amount", "Gross Amount", "GROSS REVENUE ACCOUNT CURRENCY"])
    )
  );

  const workTitle = asString(
    pick(
      getField(canonical, ["work_title", "title"]),
      getField(normalized, ["work_title", "title"]),
      getField(raw, ["work_title", "Work Title", "TITLE"])
    )
  );

  const releaseTitle = asString(
    pick(
      getField(canonical, ["release_title"]),
      getField(normalized, ["release_title"]),
      getField(raw, ["release_title", "Release Title"])
    )
  );

  const artistName = asString(
    pick(
      getField(canonical, ["artist_name"]),
      getField(normalized, ["artist_name"]),
      getField(raw, ["artist_name", "Artist", "ARTIST"])
    )
  );

  const nextCanonical = {
    ...(canonical ?? {}),
    currency,
    net_amount: netAmount,
    gross_amount: grossAmount,
    work_title: workTitle,
    release_title: releaseTitle,
    artist_name: artistName,
  };

  const nextStatus =
    currency && (netAmount != null || grossAmount != null)
      ? "parsed"
      : row.status ?? "processing";

  return {
    import_job_id: row.import_job_id ?? row.import_id,
    canonical: nextCanonical,
    currency,
    net_amount: netAmount,
    gross_amount: grossAmount,
    status: nextStatus,
  };
}

export async function finalizeImportRowsForJob(importJobId: string) {
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("import_rows")
    .select(
      `
      id,
      import_id,
      import_job_id,
      raw,
      normalized,
      canonical,
      currency,
      net_amount,
      gross_amount,
      matched_work_id,
      status
      `
    )
    .or(`import_job_id.eq.${importJobId},import_id.eq.${importJobId}`)
    .limit(10000);

  if (rowsError) {
    throw new Error(`Failed to load import rows for finalize: ${rowsError.message}`);
  }

  const typedRows: CanonicalImportRow[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    import_id: row.import_id ? String(row.import_id) : null,
    import_job_id: row.import_job_id ? String(row.import_job_id) : null,
    raw: getObject(row.raw),
    normalized: getObject(row.normalized),
    canonical: getObject(row.canonical),
    currency: asString(row.currency),
    net_amount: asNumber(row.net_amount),
    gross_amount: asNumber(row.gross_amount),
    matched_work_id: row.matched_work_id ? String(row.matched_work_id) : null,
    status: asString(row.status),
  }));

  if (typedRows.length === 0) {
    await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "failed",
      })
      .eq("id", importJobId);

    return {
      rowCount: 0,
      parsedCount: 0,
      matchedCount: 0,
    };
  }

  const updates = typedRows.map((row) => ({
    id: row.id,
    ...buildCanonicalRow(row),
  }));

  const { error: upsertError } = await supabaseAdmin
    .from("import_rows")
    .upsert(updates, { onConflict: "id" });

  if (upsertError) {
    throw new Error(`Failed to finalize import rows: ${upsertError.message}`);
  }

  const parsedCount = updates.filter(
    (row) => row.status === "parsed"
  ).length;

  const matchedCount = typedRows.filter((row) => row.matched_work_id != null).length;

  await supabaseAdmin
    .from("import_jobs")
    .update({
      status: parsedCount > 0 ? "parsed" : "processing",
    })
    .eq("id", importJobId);

  return {
    rowCount: typedRows.length,
    parsedCount,
    matchedCount,
  };
}

export async function processImportJob(input: { importJobId: string } | string) {
  const importJobId =
    typeof input === "string" ? input : String(input.importJobId ?? "");

  if (!importJobId) {
    throw new Error("Missing importJobId");
  }

  return finalizeImportRowsForJob(importJobId);
}