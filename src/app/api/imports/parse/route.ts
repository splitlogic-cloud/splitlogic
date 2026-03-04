import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
    const raw: Record<string, any> = {};
    headers.forEach((h, i) => (raw[h] = (values[i] ?? "").trim() || null));

    return {
      row_number: idx + 1,
      raw,
      status: "ok",
      error: null,
    };
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const companySlug = String(body.companySlug ?? "").trim();
    const importId = String(body.importJobId ?? body.importId ?? "").trim();
    if (!companySlug || !importId) {
      return NextResponse.json({ ok: false, error: "missing companySlug/importId" }, { status: 400 });
    }

    // company
    const { data: company, error: cErr } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("slug", companySlug)
      .single();
    if (cErr || !company?.id) {
      return NextResponse.json({ ok: false, error: cErr?.message ?? "Company not found" }, { status: 404 });
    }

    // job
    const { data: job, error: jErr } = await supabaseAdmin
      .from("import_jobs")
      .select("id, company_id, storage_bucket, storage_path")
      .eq("id", importId)
      .eq("company_id", company.id)
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
      row_number: r.row_number,
      raw: r.raw,
      status: r.status,
      error: r.error,
    }));

    for (const batch of chunk(payload, 300)) {
      const { error: upErr } = await supabaseAdmin
        .from("import_rows")
        .upsert(batch, { onConflict: "import_id,row_number" });

      if (upErr) {
        await supabaseAdmin.from("import_jobs").update({ status: "failed" }).eq("id", importId);
        return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      }
    }

    await supabaseAdmin.from("import_jobs").update({ status: "parsed" }).eq("id", importId);

    return NextResponse.json({ ok: true, rows: payload.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}