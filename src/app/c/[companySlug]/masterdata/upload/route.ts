import "server-only";

import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

const BUCKET = "imports"; // ändra om din bucket heter något annat
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

type AnyParams = Record<string, string | string[] | undefined>;
type Ctx = { params: AnyParams | Promise<AnyParams> };

type ParsedRow = {
  row_number: number;
  raw: any;
  status: "ok" | "invalid";
  error: string | null;
};

function pickSlug(params: AnyParams): string | null {
  const v = params?.companySlug ?? params?.slug ?? params?.company;
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
  return null;
}

function isEmpty(v: any) {
  return v == null || String(v).trim() === "";
}

function parseIntSafe(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

// Minimal CSV parser (comma, quotes, CRLF)
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    cur.push(field);
    field = "";
  };

  const pushRow = () => {
    // ignore final empty line
    if (cur.length === 1 && cur[0] === "" && rows.length > 0) {
      cur = [];
      return;
    }
    rows.push(cur);
    cur = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (ch === "\r") continue;

    field += ch;
  }

  pushField();
  pushRow();

  const headerRow = rows.shift() ?? [];
  const headers = headerRow.map((h) => String(h ?? "").trim());
  return { headers, rows };
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Expected headers (case-insensitive):
 * - work_external_id
 * - work_title
 * - party_external_id
 * - party_name
 * - role
 * - share_bps   (0..10000)
 */
function validateAndBuildRows(headers: string[], dataRows: string[][]) {
  const warnings: string[] = [];
  const normHeaders = headers.map(normalizeHeader);

  const idx = (name: string) => normHeaders.indexOf(name);

  const iWorkExt = idx("work_external_id");
  const iWorkTitle = idx("work_title");
  const iPartyExt = idx("party_external_id");
  const iPartyName = idx("party_name");
  const iRole = idx("role");
  const iShare = idx("share_bps");

  const missing = [
    ["work_external_id", iWorkExt],
    ["work_title", iWorkTitle],
    ["party_external_id", iPartyExt],
    ["party_name", iPartyName],
    ["role", iRole],
    ["share_bps", iShare],
  ].filter(([, i]) => i === -1);

  if (missing.length) {
    const m = missing.map(([n]) => n).join(", ");
    throw new Error(
      `CSV headers missing: ${m}. Expected: work_external_id, work_title, party_external_id, party_name, role, share_bps`
    );
  }

  const parsed: ParsedRow[] = [];

  // group sums per work_external_id + role
  const sums = new Map<string, number>();
  const rowKeys: string[] = [];

  for (let r = 0; r < dataRows.length; r++) {
    const cols = dataRows[r];
    const row_number = r + 1;

    const work_external_id = (cols[iWorkExt] ?? "").trim();
    const work_title = (cols[iWorkTitle] ?? "").trim();
    const party_external_id = (cols[iPartyExt] ?? "").trim();
    const party_name = (cols[iPartyName] ?? "").trim();
    const role = (cols[iRole] ?? "").trim();
    const share_bps_raw = (cols[iShare] ?? "").trim();

    const raw = {
      work_external_id,
      work_title,
      party_external_id,
      party_name,
      role,
      share_bps: share_bps_raw,
    };

    let error: string | null = null;

    if (isEmpty(work_external_id)) error = "Missing work_external_id";
    else if (isEmpty(work_title)) error = "Missing work_title";
    else if (isEmpty(party_external_id)) error = "Missing party_external_id";
    else if (isEmpty(party_name)) error = "Missing party_name";
    else if (isEmpty(role)) error = "Missing role";

    const share_bps = parseIntSafe(share_bps_raw);
    if (!error) {
      if (share_bps == null) error = "share_bps must be an integer";
      else if (share_bps < 0 || share_bps > 10000) error = "share_bps must be between 0 and 10000";
    }

    const key = `${work_external_id}::${role}`;
    rowKeys.push(key);

    if (!error && share_bps != null) {
      sums.set(key, (sums.get(key) ?? 0) + share_bps);
    }

    parsed.push({
      row_number,
      raw,
      status: error ? "invalid" : "ok",
      error,
    });
  }

  // enforce sums = 10000 per group
  const badKeys = new Set<string>();
  for (const [key, sum] of sums.entries()) {
    if (sum !== 10000) {
      badKeys.add(key);
      warnings.push(`Sum share_bps for ${key.replace("::", " + ")} = ${sum} (expected 10000)`);
    }
  }

  if (badKeys.size) {
    for (let i = 0; i < parsed.length; i++) {
      const k = rowKeys[i];
      if (badKeys.has(k) && parsed[i].status === "ok") {
        parsed[i].status = "invalid";
        parsed[i].error = `Sum share_bps for group ${k.replace("::", " + ")} is not 10000`;
      }
    }
  }

  const ok = parsed.filter((p) => p.status === "ok").length;
  const invalid = parsed.length - ok;
  const total = parsed.length;

  return { parsed, warnings, ok, invalid, total };
}

export async function POST(req: Request, ctx: Ctx) {
  const params = (await ctx.params) as AnyParams;
  const companySlug = pickSlug(params);

  if (!companySlug) {
    return NextResponse.json({ error: "Missing companySlug in route params" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // auth check
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // access check + get company
  const company = await requireCompanyBySlugForUser(companySlug);

  // parse multipart/form-data
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" in form-data' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES} bytes)` }, { status: 413 });
  }

  const fileName = file.name || "upload.csv";
  const fileType = file.type || "text/csv";
  const fileSize = file.size;

  // read bytes once
  const bytes = await file.arrayBuffer();
  const buf = Buffer.from(bytes);

  // sha256 for audit/dedupe
  const sha = createHash("sha256").update(buf).digest("hex");

  // storage_path is NOT NULL in your schema → create upfront
  const objectKey = `${companySlug}/masterdata/${randomUUID()}-${fileName}`;

  // Create import_job (status must match check constraint)
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .insert({
      company_id: company.id,
      source: "masterdata",
      provider: "manual",
      status: "uploaded", // ✅ allowed
      storage_bucket: BUCKET,
      storage_path: objectKey, // ✅ NOT NULL
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      content_sha256: sha,
      error_code: null,
      error_message: null,
      period_start: null,
      period_end: null,
    })
    .select("id")
    .single();

  if (jobErr || !job?.id) {
    return NextResponse.json(
      { error: `Failed to create import_job: ${jobErr?.message || "unknown"}` },
      { status: 500 }
    );
  }

  const importJobId = String(job.id);

  try {
    // Mark processing
    await supabase.from("import_jobs").update({ status: "processing" }).eq("id", importJobId);

    // Upload to storage (same objectKey as stored in DB)
    const uploadRes = await supabaseAdmin.storage
  .from(BUCKET)
  .upload(objectKey, buf, { contentType: fileType, upsert: true });

    if (uploadRes.error) {
      throw new Error(`Storage upload failed: ${uploadRes.error.message}`);
    }

    // Parse + validate CSV
    const text = buf.toString("utf-8");
    const { headers, rows } = parseCsv(text);
    const { parsed, warnings, ok, invalid, total } = validateAndBuildRows(headers, rows);

    // Clear old rows (idempotent)
    const { error: delErr } = await supabase.from("import_rows").delete().eq("import_id", importJobId);
    if (delErr) throw new Error(`Failed to clear previous import_rows: ${delErr.message}`);

    // Insert import_rows
    const rowsToInsert = parsed.map((p) => ({
      import_id: importJobId,
      row_number: p.row_number,
      raw: p.raw,
      error: p.error,       // ✅ null = ok, text = invalid
    }));

    for (const part of chunk(rowsToInsert, 500)) {
      const { error: insErr } = await supabase.from("import_rows").insert(part);
      if (insErr) throw new Error(`Failed to insert import_rows: ${insErr.message}`);
    }

    // Store summary in error_message (since you don't have warnings/count columns)
    const summary =
      warnings.length > 0
        ? `Parsed ${total} rows (ok=${ok}, invalid=${invalid}). Warnings: ${warnings.join(" | ")}`
        : `Parsed ${total} rows (ok=${ok}, invalid=${invalid}).`;

    // Mark parsed (✅ allowed). If invalid > 0 we set error_code but still parsed.
    const { error: updErr } = await supabase
      .from("import_jobs")
      .update({
        status: "parsed",
        error_code: invalid > 0 ? "VALIDATION_FAILED" : null,
        error_message: summary,
      })
      .eq("id", importJobId);

    if (updErr) throw new Error(`Failed to update import_job: ${updErr.message}`);

    return NextResponse.json({
      import_job_id: importJobId,
      status: "parsed",
      ok,
      invalid,
      total,
      warnings,
      storage_bucket: BUCKET,
      storage_path: objectKey,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      content_sha256: sha,
    });
  } catch (e: any) {
    const msg = e?.message || "Upload failed";

    // Can't set "failed" if not allowed; keep parsed and write error fields
    await supabase
      .from("import_jobs")
      .update({
        status: "parsed",
        error_code: "UPLOAD_FAILED",
        error_message: msg,
      })
      .eq("id", importJobId);

    return NextResponse.json({ error: msg, import_job_id: importJobId }, { status: 400 });
  }
}