import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCompanyMembershipBySlug } from "@/lib/company-membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// OBS: enkel CSV (ingen quoted-comma). Tillräckligt för nu, vi gör robust senare.
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line, idx) => {
    const values = line.split(",");
    const raw: Record<string, string | null> = {};
    headers.forEach((h, i) => (raw[h] = (values[i] ?? "").trim() || null));

    return {
      row_number: idx + 1,
      raw,
      status: "ok",
      error: null,
    };
  });
}

async function upsertImportRows(
  rows: Array<{
    import_id: string;
    import_job_id: string;
    row_number: number;
    raw: Record<string, string | null>;
    status: string;
    error: string | null;
  }>,
  importId: string
): Promise<{ error: { message: string } | null }> {
  const importJobPayload = rows.map((row) => ({
    import_job_id: row.import_job_id,
    row_number: row.row_number,
    raw: row.raw,
    status: row.status,
    error: row.error,
  }));
  const importPayload = rows.map((row) => ({
    import_id: row.import_id,
    row_number: row.row_number,
    raw: row.raw,
    status: row.status,
    error: row.error,
  }));

  const byImportJobId = await supabaseAdmin
    .from("import_rows")
    .upsert(importJobPayload, { onConflict: "import_job_id,row_number" });
  if (!byImportJobId.error) {
    return { error: null };
  }

  const byImportId = await supabaseAdmin
    .from("import_rows")
    .upsert(importPayload, { onConflict: "import_id,row_number" });
  if (!byImportId.error) {
    return { error: null };
  }

  await supabaseAdmin.from("import_jobs").update({ status: "failed" }).eq("id", importId);
  return { error: { message: byImportId.error.message } };
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body: Record<string, unknown> = await req
      .json()
      .catch(() => ({} as Record<string, unknown>));
    const companySlug = String(body.companySlug ?? "").trim();
    const importId = String(body.importJobId ?? body.importId ?? "").trim();
    if (!companySlug || !importId) {
      return NextResponse.json({ ok: false, error: "missing companySlug/importId" }, { status: 400 });
    }

    const membership = await requireCompanyMembershipBySlug({
      supabase,
      companySlug,
      userId: auth.user.id,
    });
    const companyId = membership.company.id;

    // job
    const { data: job, error: jErr } = await supabaseAdmin
      .from("import_jobs")
      .select("id, company_id, storage_bucket, storage_path")
      .eq("id", importId)
      .eq("company_id", companyId)
      .single();

    if (jErr || !job) {
      return NextResponse.json({ ok: false, error: jErr?.message ?? "Import job not found" }, { status: 404 });
    }

    await supabaseAdmin.from("import_jobs").update({ status: "processing" }).eq("id", importId);

    // download
    const { data: fileData, error: dErr } = await supabaseAdmin.storage
      .from(job.storage_bucket)
      .download(job.storage_path);

    if (dErr || !fileData) {
      await supabaseAdmin.from("import_jobs").update({ status: "failed" }).eq("id", importId);
      return NextResponse.json({ ok: false, error: dErr?.message ?? "Download failed" }, { status: 500 });
    }

    const text = await fileData.text();
    const parsed = parseCsv(text);

    // UPSERT i batchar (ingen DELETE => inga timeouts)
    const payload = parsed.map((r) => ({
      import_id: importId,
      import_job_id: importId,
      row_number: r.row_number,
      raw: r.raw,
      status: r.status,
      error: r.error,
    }));

    for (const batch of chunk(payload, 300)) {
      const { error: upErr } = await upsertImportRows(batch, importId);

      if (upErr) {
        await supabaseAdmin.from("import_jobs").update({ status: "failed" }).eq("id", importId);
        return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      }
    }

    await supabaseAdmin.from("import_jobs").update({ status: "parsed" }).eq("id", importId);

    return NextResponse.json({ ok: true, rows: payload.length });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}