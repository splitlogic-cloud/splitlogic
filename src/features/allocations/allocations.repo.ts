import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type RateBase = "net" | "gross" | "ppd";

export type CompanyRow = {
  id: string;
  slug: string | null;
  name?: string | null;
};

export type ImportJobRow = {
  id: string;
  company_id: string;
  file_name?: string | null;
  created_at?: string | null;
};

export type ImportRowForAllocation = {
  id: string;
  company_id: string;
  import_job_id: string;
  row_number?: number | null;
  release_id?: string | null;
  release_title?: string | null;
  work_id?: string | null;
  work_title?: string | null;
  party_id?: string | null;
  currency?: string | null;
  net_amount?: number | null;
  gross_amount?: number | null;
  ppd_amount?: number | null;
  normalized_data?: Record<string, unknown> | null;
  raw_data?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type AllocationRuleRow = {
  id: string;
  company_id: string;
  rule_name?: string | null;
  party_id: string;
  release_id?: string | null;
  work_id?: string | null;
  rate_percent: number;
  rate_base: RateBase;
  base_rate_percent?: number | null;
  priority?: number | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

export type AllocationRunRow = {
  id: string;
  company_id: string;
  import_job_id: string;
  status?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  created_at?: string | null;
};

export type AllocationRunLineInsert = {
  company_id: string;
  import_job_id: string;
  allocation_run_id: string;
  import_row_id: string;
  party_id: string;
  release_id?: string | null;
  release_title?: string | null;
  work_id?: string | null;
  work_title?: string | null;
  source_amount?: number | null;
  share_percent?: number | null;
  allocated_amount: number;
  currency?: string | null;
  rule_id?: string | null;
  rate_base?: RateBase | null;
  rate_percent?: number | null;
  base_rate_percent?: number | null;
  created_at?: string | null;
};

export type AllocationBlockerStatus =
  | "missing_amount"
  | "missing_work"
  | "missing_release"
  | "missing_splits";

export type AllocationBlockerRow = {
  import_row_id: string;
  row_number: number | null;
  status: AllocationBlockerStatus;
  blocker_code: string;
  blocker_label: string;
  release_title: string | null;
  work_title: string | null;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  ppd_amount: number | null;
};

export type AllocationTotalByPartyRow = {
  party_id: string | null;
  party_name: string | null;
  currency: string | null;
  line_count: number;
  total_allocated_amount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const s = String(value).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickString(
  row: Record<string, unknown>,
  normalized: Record<string, unknown>,
  raw: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const v1 = asString(row[key]);
    if (v1) return v1;

    const v2 = asString(normalized[key]);
    if (v2) return v2;

    const v3 = asString(raw[key]);
    if (v3) return v3;
  }
  return null;
}

function pickNumber(
  row: Record<string, unknown>,
  normalized: Record<string, unknown>,
  raw: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const v1 = asNumber(row[key]);
    if (v1 !== null) return v1;

    const v2 = asNumber(normalized[key]);
    if (v2 !== null) return v2;

    const v3 = asNumber(raw[key]);
    if (v3 !== null) return v3;
  }
  return null;
}

function normalizeImportRow(row: Record<string, unknown>): ImportRowForAllocation {
  const normalized = asRecord(row.normalized_data);
  const raw = asRecord(row.raw_data);

  return {
    id: String(row.id),
    company_id: String(row.company_id),
    import_job_id: String(row.import_job_id),
    row_number: asNumber(row.row_number),
    release_id: pickString(row, normalized, raw, ["release_id", "releaseId"]),
    release_title: pickString(row, normalized, raw, [
      "release_title",
      "releaseTitle",
      "album",
      "release",
    ]),
    work_id: pickString(row, normalized, raw, ["work_id", "workId"]),
    work_title: pickString(row, normalized, raw, [
      "work_title",
      "workTitle",
      "track_title",
      "trackTitle",
      "title",
      "song_title",
      "songTitle",
    ]),
    party_id: pickString(row, normalized, raw, ["party_id", "partyId"]),
    currency: pickString(row, normalized, raw, ["currency", "sale_currency"]),
    net_amount: pickNumber(row, normalized, raw, ["net_amount", "net", "amount_net"]),
    gross_amount: pickNumber(row, normalized, raw, ["gross_amount", "gross", "amount_gross"]),
    ppd_amount: pickNumber(row, normalized, raw, ["ppd_amount", "ppd"]),
    normalized_data: normalized,
    raw_data: raw,
    created_at: asString(row.created_at),
  };
}

export async function getCompanyBySlug(
  companySlug: string,
): Promise<CompanyRow | null> {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (error) {
    throw new Error(`getCompanyBySlug failed: ${error.message}`);
  }

  return (data as CompanyRow | null) ?? null;
}

export async function getImportJobById(
  companyId: string,
  importJobId: string,
): Promise<ImportJobRow | null> {
  const { data, error } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, file_name, created_at")
    .eq("company_id", companyId)
    .eq("id", importJobId)
    .maybeSingle();

  if (error) {
    throw new Error(`getImportJobById failed: ${error.message}`);
  }

  return (data as ImportJobRow | null) ?? null;
}

export async function listImportRowsForAllocation(
  companyId: string,
  importJobId: string,
): Promise<ImportRowForAllocation[]> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select(`
      id,
      company_id,
      import_job_id,
      row_number,
      release_id,
      release_title,
      work_id,
      work_title,
      party_id,
      currency,
      net_amount,
      gross_amount,
      ppd_amount,
      normalized_data,
      raw_data,
      created_at
    `)
    .eq("company_id", companyId)
    .eq("import_job_id", importJobId)
    .order("row_number", { ascending: true });

  if (error) {
    throw new Error(`listImportRowsForAllocation failed: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeImportRow(row as Record<string, unknown>));
}

export async function listActiveAllocationRules(
  companyId: string,
): Promise<AllocationRuleRow[]> {
  const { data, error } = await supabaseAdmin
    .from("allocation_rules")
    .select(`
      id,
      company_id,
      rule_name,
      party_id,
      release_id,
      work_id,
      rate_percent,
      rate_base,
      base_rate_percent,
      priority,
      is_active,
      created_at
    `)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    throw new Error(`listActiveAllocationRules failed: ${error.message}`);
  }

  return ((data ?? []) as AllocationRuleRow[]).map((row) => ({
    ...row,
    rate_percent: asNumber(row.rate_percent) ?? 0,
    rate_base: (row.rate_base ?? "net") as RateBase,
    base_rate_percent: asNumber(row.base_rate_percent) ?? 100,
    priority: asNumber(row.priority) ?? 100,
  }));
}

export async function createAllocationRun(
  companyId: string,
  importJobId: string,
): Promise<AllocationRunRow> {
  const payload = {
    company_id: companyId,
    import_job_id: importJobId,
    status: "running",
  };

  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .insert(payload)
    .select("id, company_id, import_job_id, status, started_at, finished_at, error_message, created_at")
    .single();

  if (error) {
    throw new Error(`createAllocationRun failed: ${error.message}`);
  }

  return data as AllocationRunRow;
}

export async function replaceAllocationRunLines(
  allocationRunId: string,
  lines: AllocationRunLineInsert[],
): Promise<void> {
  const { error: deleteError } = await supabaseAdmin
    .from("allocation_run_lines")
    .delete()
    .eq("allocation_run_id", allocationRunId);

  if (deleteError) {
    throw new Error(`replaceAllocationRunLines delete failed: ${deleteError.message}`);
  }

  if (!lines.length) return;

  const { error: insertError } = await supabaseAdmin
    .from("allocation_run_lines")
    .insert(lines);

  if (insertError) {
    throw new Error(`replaceAllocationRunLines insert failed: ${insertError.message}`);
  }
}

export async function finishAllocationRun(
  allocationRunId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", allocationRunId);

  if (error) {
    throw new Error(`finishAllocationRun failed: ${error.message}`);
  }
}

export async function failAllocationRun(
  allocationRunId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("allocation_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", allocationRunId);

  if (error) {
    throw new Error(`failAllocationRun failed: ${error.message}`);
  }
}

export async function getLatestAllocationRunForImport(
  companyId: string,
  importJobId: string,
): Promise<AllocationRunRow | null> {
  const { data, error } = await supabaseAdmin
    .from("allocation_runs")
    .select("id, company_id, import_job_id, status, started_at, finished_at, error_message, created_at")
    .eq("company_id", companyId)
    .eq("import_job_id", importJobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestAllocationRunForImport failed: ${error.message}`);
  }

  return (data as AllocationRunRow | null) ?? null;
}

export async function listAllocationBlockersForImport(
  companyId: string,
  importJobId: string,
): Promise<AllocationBlockerRow[]> {
  const rows = await listImportRowsForAllocation(companyId, importJobId);

  const blockers: AllocationBlockerRow[] = [];

  for (const row of rows) {
    const hasAnyAmount =
      row.net_amount !== null ||
      row.gross_amount !== null ||
      row.ppd_amount !== null;

    if (!hasAnyAmount) {
      blockers.push({
        import_row_id: row.id,
        row_number: row.row_number ?? null,
        status: "missing_amount",
        blocker_code: "missing_amount",
        blocker_label: "Missing amount base",
        release_title: row.release_title ?? null,
        work_title: row.work_title ?? null,
        currency: row.currency ?? null,
        net_amount: row.net_amount ?? null,
        gross_amount: row.gross_amount ?? null,
        ppd_amount: row.ppd_amount ?? null,
      });
    }

    if (!row.work_id && !row.work_title) {
      blockers.push({
        import_row_id: row.id,
        row_number: row.row_number ?? null,
        status: "missing_work",
        blocker_code: "missing_work",
        blocker_label: "Missing work",
        release_title: row.release_title ?? null,
        work_title: row.work_title ?? null,
        currency: row.currency ?? null,
        net_amount: row.net_amount ?? null,
        gross_amount: row.gross_amount ?? null,
        ppd_amount: row.ppd_amount ?? null,
      });
    }

    if (!row.release_id && !row.release_title) {
      blockers.push({
        import_row_id: row.id,
        row_number: row.row_number ?? null,
        status: "missing_release",
        blocker_code: "missing_release",
        blocker_label: "Missing release",
        release_title: row.release_title ?? null,
        work_title: row.work_title ?? null,
        currency: row.currency ?? null,
        net_amount: row.net_amount ?? null,
        gross_amount: row.gross_amount ?? null,
        ppd_amount: row.ppd_amount ?? null,
      });
    }

    if (!row.party_id) {
      blockers.push({
        import_row_id: row.id,
        row_number: row.row_number ?? null,
        status: "missing_splits",
        blocker_code: "missing_splits",
        blocker_label: "Missing splits",
        release_title: row.release_title ?? null,
        work_title: row.work_title ?? null,
        currency: row.currency ?? null,
        net_amount: row.net_amount ?? null,
        gross_amount: row.gross_amount ?? null,
        ppd_amount: row.ppd_amount ?? null,
      });
    }
  }

  return blockers;
}

export async function listAllocationTotalsByParty(
  companyId: string,
  importJobId: string,
): Promise<AllocationTotalByPartyRow[]> {
  const latestRun = await getLatestAllocationRunForImport(companyId, importJobId);

  if (!latestRun) return [];

  const { data: lines, error: linesError } = await supabaseAdmin
    .from("allocation_run_lines")
    .select("party_id, currency, allocated_amount")
    .eq("allocation_run_id", latestRun.id);

  if (linesError) {
    throw new Error(`listAllocationTotalsByParty load lines failed: ${linesError.message}`);
  }

  const partyIds = Array.from(
    new Set((lines ?? []).map((line) => asString(line.party_id)).filter(Boolean)),
  ) as string[];

  let partyMap = new Map<string, string>();

  if (partyIds.length > 0) {
    const { data: parties, error: partiesError } = await supabaseAdmin
      .from("parties")
      .select("id, name")
      .in("id", partyIds);

    if (partiesError) {
      throw new Error(`listAllocationTotalsByParty load parties failed: ${partiesError.message}`);
    }

    partyMap = new Map(
      (parties ?? []).map((party) => [String(party.id), asString(party.name) ?? ""]),
    );
  }

  const grouped = new Map<string, AllocationTotalByPartyRow>();

  for (const line of lines ?? []) {
    const partyId = asString(line.party_id);
    const currency = asString(line.currency);
    const amount = asNumber(line.allocated_amount) ?? 0;
    const key = `${partyId ?? ""}__${currency ?? ""}`;

    const existing = grouped.get(key);

    if (existing) {
      existing.line_count += 1;
      existing.total_allocated_amount += amount;
    } else {
      grouped.set(key, {
        party_id: partyId,
        party_name: partyId ? (partyMap.get(partyId) ?? null) : null,
        currency,
        line_count: 1,
        total_allocated_amount: amount,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const aName = a.party_name ?? "";
    const bName = b.party_name ?? "";
    return aName.localeCompare(bName);
  });
}

function ruleSpecificity(rule: AllocationRuleRow): number {
  let score = 0;
  if (rule.release_id) score += 1;
  if (rule.work_id) score += 2;
  return score;
}

function sourceAmountForRule(
  row: ImportRowForAllocation,
  rule: AllocationRuleRow,
): number | null {
  if (rule.rate_base === "gross") return row.gross_amount ?? null;
  if (rule.rate_base === "ppd") return row.ppd_amount ?? null;
  return row.net_amount ?? null;
}

function ruleMatchesRow(
  rule: AllocationRuleRow,
  row: ImportRowForAllocation,
): boolean {
  if (rule.release_id && rule.release_id !== row.release_id) return false;
  if (rule.work_id && rule.work_id !== row.work_id) return false;
  return true;
}

function selectBestRule(
  rules: AllocationRuleRow[],
  row: ImportRowForAllocation,
): AllocationRuleRow | null {
  const matches = rules.filter((rule) => ruleMatchesRow(rule, row));

  if (!matches.length) return null;

  matches.sort((a, b) => {
    const specDiff = ruleSpecificity(b) - ruleSpecificity(a);
    if (specDiff !== 0) return specDiff;

    const prioA = a.priority ?? 100;
    const prioB = b.priority ?? 100;
    if (prioA !== prioB) return prioA - prioB;

    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });

  return matches[0] ?? null;
}

export async function runAllocationEngineV1(
  companyId: string,
  importJobId: string,
): Promise<AllocationRunRow> {
  const run = await createAllocationRun(companyId, importJobId);

  try {
    const rows = await listImportRowsForAllocation(companyId, importJobId);
    const rules = await listActiveAllocationRules(companyId);

    const inserts: AllocationRunLineInsert[] = [];

    for (const row of rows) {
      const rule = selectBestRule(rules, row);
      if (!rule) continue;

      const sourceAmount = sourceAmountForRule(row, rule);
      if (sourceAmount === null) continue;

      const ratePercent = rule.rate_percent ?? 0;
      const baseRatePercent = rule.base_rate_percent ?? 100;
      const effectiveRatePercent = (ratePercent * baseRatePercent) / 100;
      const allocatedAmount = (sourceAmount * effectiveRatePercent) / 100;

      inserts.push({
        company_id: companyId,
        import_job_id: importJobId,
        allocation_run_id: run.id,
        import_row_id: row.id,
        party_id: rule.party_id,
        release_id: row.release_id ?? null,
        release_title: row.release_title ?? null,
        work_id: row.work_id ?? null,
        work_title: row.work_title ?? null,
        source_amount: sourceAmount,
        share_percent: effectiveRatePercent,
        allocated_amount: allocatedAmount,
        currency: row.currency ?? null,
        rule_id: rule.id,
        rate_base: rule.rate_base,
        rate_percent: ratePercent,
        base_rate_percent: baseRatePercent,
      });
    }

    await replaceAllocationRunLines(run.id, inserts);
    await finishAllocationRun(run.id);

    const latest = await getLatestAllocationRunForImport(companyId, importJobId);
    if (!latest) {
      throw new Error("Allocation run finished but could not be reloaded");
    }

    return latest;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown allocation engine error";

    await failAllocationRun(run.id, message);
    throw error;
  }
}