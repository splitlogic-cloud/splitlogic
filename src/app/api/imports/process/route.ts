import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  importId?: string; // import_jobs.id
  import_id?: string;
  id?: string;
};

function json(status: number, payload: any) {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isUuid(v: unknown) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

// så du slipper 405 om du råkar öppna i browser
export async function GET() {
  return json(200, { ok: true, hint: 'POST JSON: { "importId": "<uuid>" }' });
}

async function readBody(req: Request): Promise<Body> {
  // 1) försök req.json() först
  try {
    const j = (await req.json()) as any;
    if (j && typeof j === "object") return j as Body;
  } catch {
    // fallback till text
  }

  const raw = await req.text();
  if (!raw) throw new Error("Empty body");

  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new Error("Empty body");

  try {
    const j = JSON.parse(cleaned);
    if (!j || typeof j !== "object") throw new Error("JSON must be an object");
    return j as Body;
  } catch {
    throw new Error(`Invalid JSON body (len=${cleaned.length})`);
  }
}

export async function POST(req: Request) {
  try {
    // 1) Läs body robust
    const body = await readBody(req);

    const importId = body.importId ?? body.import_id ?? body.id;
    if (!importId) return json(400, { ok: false, error: "Missing importId" });
    if (!isUuid(importId)) return json(400, { ok: false, error: "importId must be a UUID" });

    // 2) Hämta job (och company/provider)
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .select("id, company_id, provider, status")
      .eq("id", importId)
      .single();

    if (jobErr) return json(500, { ok: false, error: `load import_job: ${jobErr.message}` });
    if (!job) return json(404, { ok: false, error: "Import job not found" });

    // Blocka bara om failed (så du inte råkar processa trasiga jobb)
    if (job.status === "failed") {
      return json(400, { ok: false, error: "Job is failed; cannot process." });
    }

    // 3) Sätt status = processing (tillåtet av din CHECK constraint)
    const { error: setProcessingErr } = await supabaseAdmin
      .from("import_jobs")
      .update({ status: "processing" })
      .eq("id", importId);

    if (setProcessingErr) {
      return json(500, { ok: false, error: `set processing: ${setProcessingErr.message}` });
    }

    // provider är NOT NULL i revenue_rows, vi säkrar alltid ett värde
    const provider = (job.provider ?? "unknown") as string;

    // 4) Processa import_rows -> revenue_rows i batches (KEYSET PAGINATION)
    // - ingen offset/range
    // - hämtar nästa page via row_number > lastRowNumber
    const BATCH = 500; // sänk till 200 om du fortfarande får timeout
    let lastRowNumber = 0;

    let totalRowsRead = 0;
    let inserted = 0;
    let skipped = 0;

    while (true) {
      const { data: rows, error: rowsErr } = await supabaseAdmin
        .from("import_rows")
        .select("id, row_number, raw, normalized, error, warnings")
        .eq("import_id", importId)
        .gt("row_number", lastRowNumber)
        .order("row_number", { ascending: true })
        .limit(BATCH);

      if (rowsErr) {
        await supabaseAdmin.from("import_jobs").update({ status: "failed" }).eq("id", importId);
        return json(500, { ok: false, error: `load import_rows: ${rowsErr.message}` });
      }

      if (!rows || rows.length === 0) break;

      totalRowsRead += rows.length;

      // bygg payload för revenue_rows
      const payload = rows
        .filter((r: any) => r.error == null) // bara rader utan parse-error
        .map((r: any) => {
          const n = (r.normalized ?? {}) as any;

          return {
            company_id: job.company_id,
            import_job_id: importId,

            // idempotency
            source_row_id: r.id,

            // provider NOT NULL
            provider,

            // extra metadata
            source_system: provider,
            source_row_number: r.row_number ?? null,

            // canonical fields (matcha din schema-lista)
            event_date: n.event_date ?? n.operation_date ?? null,
            territory: n.territory ?? n.country ?? null,
            currency: n.currency ?? null,
            quantity: n.quantity ?? null,
            unit_price: n.unit_price ?? n.unitPrice ?? null,
            amount_gross: n.amount_gross ?? n.total_amount ?? n.totalAmount ?? null,
            amount_net: n.amount_net ?? n.net_amount ?? n.netAmount ?? null,

            isrc: n.isrc ?? n.ISRC ?? null,
            upc: n.upc ?? n.UPC ?? null,
            grid: n.grid ?? n.GRid ?? null,

            track_title: n.track_title ?? n.track ?? n.asset_title ?? null,
            album_title: n.album_title ?? n.album ?? n.parent_asset_title ?? null,
            artists: n.artists ?? null,

            work_id: n.work_id ?? null,
            work_ref: n.work_ref ?? null,

            // din tabell har external_track_ref
            external_track_ref: n.external_track_ref ?? n.isrc ?? n.upc ?? n.grid ?? null,

            // raw/normalized är NOT NULL
            raw: r.raw ?? {},
            normalized: r.normalized ?? {},

            // nullable copies (om du har dem)
            raw_row_json: r.raw ?? null,
            normalized_row_json: r.normalized ?? null,
          };
        });

      if (payload.length === 0) {
        skipped += rows.length;
        lastRowNumber = (rows[rows.length - 1].row_number ?? lastRowNumber) as number;
        continue;
      }

      // upsert med onConflict om indexet finns (import_job_id, source_row_id)
      const { error: upErr } = await supabaseAdmin
        .from("revenue_rows")
        .upsert(payload, { onConflict: "import_job_id,source_row_id" });

      if (upErr) {
        await supabaseAdmin.from("import_jobs").update({ status: "failed" }).eq("id", importId);
        return json(500, { ok: false, error: `upsert revenue_rows: ${upErr.message}` });
      }

      inserted += payload.length;
      skipped += rows.length - payload.length;

      // keyset cursor framåt
      lastRowNumber = (rows[rows.length - 1].row_number ?? lastRowNumber) as number;
    }

    // 5) Sätt status tillbaka till parsed + processed_at (CHECK tillåter inte processed)
    const { error: doneErr } = await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "parsed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", importId);

    if (doneErr) {
      await supabaseAdmin.from("import_jobs").update({ status: "failed" }).eq("id", importId);
      return json(500, { ok: false, error: `finalize job: ${doneErr.message}` });
    }

    return json(200, {
      ok: true,
      status: "processed", // logiskt processed
      importId,
      companyId: job.company_id,
      provider,
      totalRowsRead,
      inserted,
      skipped,
    });
  } catch (e: any) {
    return json(400, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}