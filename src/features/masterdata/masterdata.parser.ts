import { parse } from "csv-parse/sync";

export type MasterdataNormalizedRow = {
  work_external_id: string;
  work_title: string;
  party_external_id: string;
  party_name: string;
  role: string;
  share_bps: number;
};

export type ParsedImportRow = {
  row_number: number;              // 1-indexed (data-rad, ej header)
  raw: Record<string, any>;        // original row (obj)
  normalized?: MasterdataNormalizedRow;
  status: "valid" | "invalid";
  error_code?: string;
  error_message?: string;
};

const REQUIRED = [
  "work_external_id",
  "work_title",
  "party_external_id",
  "party_name",
  "role",
  "share_bps",
] as const;

function asString(v: any) {
  return String(v ?? "").trim();
}

function asInt(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  // tillåt "25.00" om någon exporterar så
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export function parseMasterdataCsv(csvText: string): ParsedImportRow[] {
  // csv-parse hanterar quotes, separators osv.
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, any>[];

  const parsed: ParsedImportRow[] = records.map((r, idx) => {
    const row_number = idx + 1;

    // required fields
    for (const k of REQUIRED) {
      if (!asString(r[k])) {
        return {
          row_number,
          raw: r,
          status: "invalid",
          error_code: "REQUIRED_MISSING",
          error_message: `Missing required field: ${k}`,
        };
      }
    }

    const share_bps = asInt(r.share_bps);
    if (!Number.isFinite(share_bps)) {
      return {
        row_number,
        raw: r,
        status: "invalid",
        error_code: "INVALID_SHARE_BPS",
        error_message: `share_bps must be an integer (0–10000). Got: "${r.share_bps}"`,
      };
    }
    if (share_bps < 0 || share_bps > 10000) {
      return {
        row_number,
        raw: r,
        status: "invalid",
        error_code: "INVALID_SHARE_BPS_RANGE",
        error_message: `share_bps out of range (0–10000). Got: ${share_bps}`,
      };
    }

    const normalized: MasterdataNormalizedRow = {
      work_external_id: asString(r.work_external_id),
      work_title: asString(r.work_title),
      party_external_id: asString(r.party_external_id),
      party_name: asString(r.party_name),
      role: asString(r.role).toLowerCase(),
      share_bps,
    };

    return {
      row_number,
      raw: r,
      normalized,
      status: "valid",
    };
  });

  // SUM-CHECK: per work_external_id + role får inte överstiga 10000
  const groups = new Map<string, { sum: number; idxs: number[] }>();

  parsed.forEach((row, i) => {
    if (row.status !== "valid" || !row.normalized) return;
    const key = `${row.normalized.work_external_id}__${row.normalized.role}`;
    const g = groups.get(key) ?? { sum: 0, idxs: [] };
    g.sum += row.normalized.share_bps;
    g.idxs.push(i);
    groups.set(key, g);
  });

  for (const [key, g] of groups.entries()) {
    if (g.sum > 10000) {
      // Markera ALLA rader i gruppen som invalid (enklast och tydligast).
      // (Vill du vara “snällare” kan du markera bara de sista som pushar över.)
      for (const i of g.idxs) {
        const row = parsed[i];
        if (!row.normalized) continue;
        row.status = "invalid";
        row.error_code = "SUM_EXCEEDS_10000";
        row.error_message =
          `Total share_bps for work_external_id+role exceeds 10000. Group "${key}" sum=${g.sum}.`;
        delete row.normalized;
      }
    }
  }

  return parsed;
}