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
    .replace(/\u00A0/g, "")
    .replace(/\s/g, "")
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
    "Title",
    "track",
    "Track",
    "TRACK",
    "track_title",
    "Track Title",
    "track_name",
    "Track Name",
    "song_title",
    "Song Title",
    "song",
    "Song",
    "asset_title",
    "Asset Title",
    "release_track_name",
    "Release Track Name",
    "work_title",
    "Work Title",
    "recording",
    "Recording",
  ]);

  const artist = pickFirstString(raw, [
    "artist",
    "Artist",
    "artist_name",
    "Artist Name",
    "track_artist",
    "Track Artist",
    "main_artist",
    "Main Artist",
  ]);

  const isrc = pickFirstString(raw, [
    "isrc",
    "ISRC",
    "isrc_code",
    "ISRC Code",
    "track_isrc",
    "Track ISRC",
    "sound_recording_code",
    "Sound Recording Code",
  ]);

  const currency = pickFirstString(raw, [
    "currency",
    "Currency",
    "account_currency",
    "ACCOUNT CURRENCY",
    "sale_currency",
    "Sale Currency",
    "royalty_currency",
    "Royalty Currency",
  ])?.toUpperCase() ?? null;

  const quantity = pickFirstNumber(raw, [
    "quantity",
    "Quantity",
    "qty",
    "Qty",
    "units",
    "Units",
    "sales_quantity",
    "Sales Quantity",
    "streams",
    "Streams",
  ]);

  const netAmount = pickFirstNumber(raw, [
    "net_amount",
    "Net Amount",
    "net",
    "Net",
    "net_revenue",
    "Net Revenue",
    "amount",
    "Amount",
    "royalty_amount",
    "Royalty Amount",
    "net_share_account_currency",
    "Net Share Account Currency",
  ]);

  const grossAmount = pickFirstNumber(raw, [
    "gross_amount",
    "Gross Amount",
    "gross",
    "Gross",
    "gross_revenue",
    "Gross Revenue",
    "sale_amount",
    "Sale Amount",
    "gross_revenue_account_currency",
    "Gross Revenue Account Currency",
  ]);

  const statementDate = pickFirstString(raw, [
    "statement_date",
    "Statement Date",
    "sale_date",
    "Sale Date",
    "report_date",
    "Report Date",
    "date",
    "Date",
  ]);

  const territory = pickFirstString(raw, [
    "territory",
    "Territory",
    "country",
    "Country",
    "sale_country",
    "Sale Country",
  ])?.toUpperCase() ?? null;

  const source = pickFirstString(raw, [
    "source",
    "Source",
    "store",
    "Store",
    "service",
    "Service",
    "platform",
    "Platform",
    "dsp",
    "DSP",
  ]);

  return {
    title,
    artist,
    isrc: isrc?.toUpperCase() ?? null,
    currency,
    quantity,
    net_amount: netAmount,
    gross_amount: grossAmount,
    statement_date: statementDate,
    territory,
    source,
  };
}