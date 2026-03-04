"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

/**
 * 1) Skapa import_job + generera signed upload URL
 * UI laddar upp filen direkt till storage med signed url.
 */
export async function createImportJobAndSignedUploadAction(input: {
  companyId: string;
  filename: string;
  contentType: string;
  source?: string;   // t.ex. "masterdata"
  provider?: string; // t.ex. "csv"
}) {
  const supabase = await createClient();

  // Auth + membership (via RLS: memberships)
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!authData?.user) throw new Error("Not authenticated");

  const { data: membership, error: memErr } = await supabase
    .from("memberships")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (memErr) throw new Error(memErr.message);
  if (!membership) throw new Error("Not a member of this company");

  const bucket = "imports";
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${input.companyId}/${Date.now()}_${safeName}`;

  // Skapa import_job
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("import_jobs")
    .insert({
      company_id: input.companyId,
      source: input.source ?? "imports",
      provider: input.provider ?? "csv",
      status: "uploaded",
      storage_bucket: bucket,
      storage_path: objectPath,
      file_name: input.filename,
      file_content_type: input.contentType,
    })
    .select("id, storage_bucket, storage_path")
    .single();

  if (jobErr) throw new Error(jobErr.message);

  // Signed upload URL (valid i 10 min)
  const { data: signed, error: signedErr } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);

  if (signedErr) throw new Error(signedErr.message);

  return {
    importJobId: job.id,
    bucket,
    path: objectPath,
    signedUploadUrl: signed.signedUrl,
    token: signed.token, // behövs för upload completion i vissa flows
  };
}

/**
 * 2) Markera att upload är klar (valfritt men bra för status)
 */
export async function markUploadCompleteAction(input: { importJobId: string }) {
  const { error } = await supabaseAdmin
    .from("import_jobs")
    .update({ status: "processing" })
    .eq("id", input.importJobId);

  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * 3) Läs fil från storage, räkna sha256, parse:a CSV, skriv import_rows + counts.
 * OBS: Denna är generisk "import parser". För masterdata kan du senare byta till din masterdata-parser.
 */
export async function parseImportCsvAction(input: { importJobId: string }) {
  // Hämta import_job
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, storage_bucket, storage_path")
    .eq("id", input.importJobId)
    .single();

  if (jobErr) throw new Error(jobErr.message);

  // Ladda ner fil
  const { data: file, error: dlErr } = await supabaseAdmin.storage
    .from(job.storage_bucket)
    .download(job.storage_path);

  if (dlErr) throw new Error(dlErr.message);
  const buf = Buffer.from(await file.arrayBuffer());

  // sha256
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

  // enkel CSV parser (robust nog för baseline)
  const text = buf.toString("utf8");
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);

  if (lines.length === 0) throw new Error("Empty CSV");

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1);

  let ok = 0;
  let invalid = 0;
  const importRows: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const values = parseCsvLine(rows[i]);
    const raw: Record<string, any> = {};
    headers.forEach((h, idx) => (raw[h] = values[idx] ?? ""));

    // generisk: ingen validering här
    importRows.push({
      import_id: job.id,
      row_number: i + 2,
      raw,
      error: null,
    });
    ok++;
  }

  // skriv rows (batch)
  if (importRows.length > 0) {
    const { error: insErr } = await supabaseAdmin.from("import_rows").insert(importRows);
    if (insErr) throw new Error(insErr.message);
  }

  // uppdatera import_job metadata + counts + status
  const { error: upErr } = await supabaseAdmin
    .from("import_jobs")
    .update({
      sha256,
      total_rows: ok + invalid,
      ok_rows: ok,
      invalid_rows: invalid,
      status: "parsed",
    })
    .eq("id", job.id);

  if (upErr) throw new Error(upErr.message);

  return { ok: true, total: ok + invalid, okRows: ok, invalidRows: invalid };
}

/** Minimal CSV-linje parser med quotes */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((s) => s.trim());
}