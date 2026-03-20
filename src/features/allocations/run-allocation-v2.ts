import "server-only";

import {
  AllocationRuleRow,
  AllocationRunLineInsert,
  RateBase,
} from "@/features/allocations/allocations.repo";

type RawRow = Record<string, unknown>;

export type RunAllocationV2Input = {
  companyId: string;
  importJobId: string;
  allocationRunId: string;
  rows: RawRow[];
  rules: AllocationRuleRow[];
};

export type RunAllocationV2Result = {
  lines: AllocationRunLineInsert[];
  inputRowCount: number;
  allocatedRowCount: number;
  skippedRowCount: number;
  warningCount: number;
};

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getBuckets(row: RawRow) {
  return {
    rawData: toObject(row.raw_data),
    normalizedData: toObject(row.normalized_data),
    metadata: toObject(row.metadata),
  };
}

function pickString(row: RawRow, keys: string[]): string | null {
  const { rawData, normalizedData, metadata } = getBuckets(row);

  for (const key of keys) {
    const direct = asString((row as any)[key]);
    if (direct) return direct;

    const normalized = asString(normalizedData[key]);
    if (normalized) return normalized;

    const raw = asString(rawData[key]);
    if (raw) return raw;

    const meta = asString(metadata[key]);
    if (meta) return meta;
  }

  return null;
}

function pickNumber(row: RawRow, keys: string[]): number | null {
  const { rawData, normalizedData, metadata } = getBuckets(row);

  for (const key of keys) {
    const direct = asNumber((row as any)[key]);
    if (direct !== null) return direct;

    const normalized = asNumber(normalizedData[key]);
    if (normalized !== null) return normalized;

    const raw = asNumber(rawData[key]);
    if (raw !== null) return raw;

    const meta = asNumber(metadata[key]);
    if (meta !== null) return meta;
  }

  return null;
}

function resolveReleaseId(row: RawRow) {
  return pickString(row, ["release_id", "matched_release_id"]);
}

function resolveReleaseTitle(row: RawRow) {
  return (
    pickString(row, [
      "release_title",
      "release_name",
      "album_title",
      "album",
      "release",
    ]) ?? "Unknown release"
  );
}

function resolveWorkId(row: RawRow) {
  return pickString(row, ["work_id", "matched_work_id"]);
}

function resolveWorkTitle(row: RawRow) {
  return (
    pickString(row, [
      "work_title",
      "track_title",
      "song_title",
      "track_name",
      "title",
    ]) ?? "Unknown work"
  );
}

function resolveCurrency(row: RawRow) {
  return pickString(row, ["currency", "account_currency", "statement_currency"]) ?? "SEK";
}

function resolveSourceDate(row: RawRow) {
  return pickString(row, ["transaction_date", "sale_date", "date", "statement_period"]);
}

function getBaseAmount(row: RawRow, base: RateBase): number | null {
  if (base === "gross") {
    return pickNumber(row, ["gross_amount", "gross_revenue", "gross_share", "amount"]);
  }

  if (base === "ppd") {
    return pickNumber(row, ["ppd_amount", "ppd", "dealer_price"]);
  }

  return pickNumber(row, ["net_amount", "net_revenue", "net_share", "amount"]);
}

function isRuleActiveOnDate(rule: AllocationRuleRow, rowDate: string | null) {
  if (!rowDate) return true;

  const source = new Date(rowDate);
  if (Number.isNaN(source.getTime())) return true;

  if (rule.valid_from) {
    const from = new Date(rule.valid_from);
    if (!Number.isNaN(from.getTime()) && source < from) return false;
  }

  if (rule.valid_to) {
    const to = new Date(rule.valid_to);
    if (!Number.isNaN(to.getTime()) && source > to) return false;
  }

  return true;
}

function ruleMatchesRow(rule: AllocationRuleRow, row: RawRow) {
  const releaseId = resolveReleaseId(row);
  const workId = resolveWorkId(row);
  const rowDate = resolveSourceDate(row);

  if (!isRuleActiveOnDate(rule, rowDate)) return false;
  if (rule.release_id && rule.release_id !== releaseId) return false;
  if (rule.work_id && rule.work_id !== workId) return false;

  return true;
}

function specificity(rule: AllocationRuleRow) {
  let score = 0;
  if (rule.release_id) score += 10;
  if (rule.work_id) score += 5;
  return score;
}

function chooseApplicableRules(rules: AllocationRuleRow[], row: RawRow) {
  const matching = rules.filter((rule) => ruleMatchesRow(rule, row));
  if (!matching.length) return [];

  const bestSpecificity = Math.max(...matching.map(specificity));

  return matching
    .filter((rule) => specificity(rule) === bestSpecificity)
    .sort((a, b) => {
      const aPriority = a.priority ?? 100;
      const bPriority = b.priority ?? 100;
      return aPriority - bPriority;
    });
}

export async function runAllocationV2(
  input: RunAllocationV2Input,
): Promise<RunAllocationV2Result> {
  const lines: AllocationRunLineInsert[] = [];
  let allocatedRowCount = 0;
  let skippedRowCount = 0;
  let warningCount = 0;

  for (const row of input.rows) {
    const rules = chooseApplicableRules(input.rules, row);

    if (!rules.length) {
      skippedRowCount += 1;
      warningCount += 1;
      continue;
    }

    const releaseId = resolveReleaseId(row);
    const releaseTitle = resolveReleaseTitle(row);
    const workId = resolveWorkId(row);
    const workTitle = resolveWorkTitle(row);
    const currency = resolveCurrency(row);
    const importRowId = asString(row.id);

    let producedLineForRow = false;

    for (const rule of rules) {
      const rateBase = (rule.rate_base ?? "net") as RateBase;
      const ratePercent = Number(rule.rate_percent ?? 0);
      const baseRatePercent = Number(rule.base_rate_percent ?? 100);
      const effectiveRatePercent = round6((ratePercent * baseRatePercent) / 100);
      const sourceAmount = getBaseAmount(row, rateBase);

      if (sourceAmount === null) {
        warningCount += 1;
        continue;
      }

      const amount = round6(sourceAmount * (effectiveRatePercent / 100));
      if (!amount) continue;

      producedLineForRow = true;

      lines.push({
        allocation_run_id: input.allocationRunId,
        company_id: input.companyId,
        import_job_id: input.importJobId,
        import_row_id: importRowId,
        party_id: rule.party_id,
        party_name: rule.party_name ?? null,
        release_id: releaseId,
        release_title: releaseTitle,
        work_id: workId,
        work_title: workTitle,
        currency,
        rate_base: rateBase,
        rate_percent: round6(ratePercent),
        base_rate_percent: round6(baseRatePercent),
        effective_rate_percent: round6(effectiveRatePercent),
        source_amount: round6(sourceAmount),
        amount,
        meta_json: {
          rule_id: rule.id,
          rule_name: rule.rule_name,
          priority: rule.priority,
          source_row_number: asNumber(row.row_number),
        },
      });
    }

    if (producedLineForRow) {
      allocatedRowCount += 1;
    } else {
      skippedRowCount += 1;
      warningCount += 1;
    }
  }

  return {
    lines,
    inputRowCount: input.rows.length,
    allocatedRowCount,
    skippedRowCount,
    warningCount,
  };
}