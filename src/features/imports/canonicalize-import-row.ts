import "server-only";

import type {
  NormalizedImportRow,
  RawImportRow,
} from "@/features/imports/imports-types";

type CanonicalImportRow = Omit<NormalizedImportRow, "raw">;

function toCleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\u00A0/g, "")
    .replace(/(?<=\d),(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirstString(row: RawImportRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = toCleanString(row[key]);
    if (value) return value;
  }
  return null;
}

function pickFirstNumber(row: RawImportRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNullableNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

export function canonicalizeImportRow(raw: RawImportRow): CanonicalImportRow {
  const title = pickFirstString(raw, [
    "title",
    "track_title",
    "track_name",
    "song_title",
    "asset_title",
    "release_track_name",
    "work_title",
  ]);

  const artist = pickFirstString(raw, [
    "artist",
    "artist_name",
    "track_artist",
    "main_artist",
  ]);

  const isrc = pickFirstString(raw, [
    "isrc",
    "isrc_code",
    "track_isrc",
    "sound_recording_code",
  ]);

  const currency = pickFirstString(raw, [
    "currency",
    "account_currency",
    "sale_currency",
    "royalty_currency",
  ]);

  const quantity = pickFirstNumber(raw, [
    "quantity",
    "qty",
    "units",
    "sales_quantity",
    "streams",
  ]);

  const netAmount = pickFirstNumber(raw, [
    "net_amount",
    "net",
    "net_revenue",
    "amount",
    "royalty_amount",
    "net_share_account_currency",
  ]);

  const grossAmount = pickFirstNumber(raw, [
    "gross_amount",
    "gross",
    "gross_revenue",
    "sale_amount",
    "gross_revenue_account_currency",
  ]);

  const statementDate = pickFirstString(raw, [
    "statement_date",
    "sale_date",
    "report_date",
    "date",
  ]);

  const territory = pickFirstString(raw, [
    "territory",
    "country",
    "sale_country",
  ]);

  const source = pickFirstString(raw, [
    "source",
    "store",
    "service",
    "platform",
    "dsp",
  ]);

  return {
    title,
    artist,
    isrc,
    currency,
    quantity,
    net_amount: netAmount,
    gross_amount: grossAmount,
    statement_date: statementDate,
    territory,
    source,
  };
}