"use server";

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type CreateJobMeta = {
  name: string;
  type: string;
  size: number;
  provider?: string;
  source?: string;
};

function getEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in .env.local");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");

  return { url, serviceKey };
}

function supabaseAdmin() {
  const { url, serviceKey } = getEnv();
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function baseAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;

  return "http://localhost:3000";
}

function safeFileName(name: string) {
  return (name || "import.csv")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Creates import_job (status=received) + returns signed upload URL.
 * Client PUTs file to uploadUrl.
 */
export async function createImportJobAndSignedUploadAction(
  companyId: string,
  meta: CreateJobMeta
): Promise<{ importId: string; uploadUrl: string }> {
  const supabase = supabaseAdmin();

  const importId = crypto.randomUUID();
  const bucket = "imports";
  const fileName = safeFileName(meta.name);

  const storagePath = `${companyId}/${importId}_${fileName}`;

  const { error: insertErr } = await supabase.from("import_jobs").insert({
    id: importId,
    company_id: companyId,
    source: meta.source ?? "manual_upload",
    provider: meta.provider ?? "unknown",
    status: "uploaded", // ✅ must match constraint
    storage_bucket: bucket,
    storage_path: storagePath,
    file_name: fileName,
    file_type: meta.type || "text/csv",
    file_size: meta.size,
  });

  if (insertErr) {
    throw new Error(`Failed creating import job: ${insertErr.message}`);
  }

  // signed upload URL
  const { data: signed, error: signedErr } = await (supabase.storage as any)
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (signedErr || !signed?.signedUrl) {
    throw new Error(`Failed creating signed upload URL: ${signedErr?.message ?? "no url"}`);
  }

  return { importId, uploadUrl: signed.signedUrl };
}

/**
 * Mark upload complete -> status uploaded
 */
export async function markUploadCompleteAction(companyId: string, importId: string) {
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("import_jobs")
    .update({ status: "uploaded" })
    .eq("id", importId)
    .eq("company_id", companyId);

  if (error) throw new Error(`Failed marking uploaded: ${error.message}`);
  return { ok: true };
}

/**
 * Trigger parse route
 */
export async function parseImportCsvAction(companyId: string, importId: string) {
  const url = `${baseAppUrl()}/api/imports/${importId}/parse`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "x-company-id": companyId },
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`Parse failed (${res.status}): ${text || res.statusText}`);
  }

  return { ok: true };
}


export async function deleteLatestImportAction(companyId: string, importId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/imports/${importId}`, {
    method: "DELETE",
    headers: {
      "x-company-id": companyId,
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? `Delete failed (${res.status})`);
  }
  return json as { ok: true; deletedImportId: string };
}