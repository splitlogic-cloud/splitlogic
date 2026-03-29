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

function normalizeIsrc(value: string | null): string | null {
  if (!value) return null;

  const normalized = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function canonicalizeImportRow(raw: RawImportRow): CanonicalImportRow {
  const title = pickFirstString(raw, [
    "title",
    "Title",
    "TITLE",

    "track",
    "Track",
    "TRACK",

    "product",
    "Product",
    "PRODUCT",

    "track_title",
    "Track Title",
    "TRACK TITLE",

    "track_name",
    "Track Name",
    "TRACK NAME",

    "song_title",
    "Song Title",
    "SONG TITLE",

    "song",
    "Song",
    "SONG",

    "asset_title",
    "Asset Title",
    "ASSET TITLE",

    "release_track_name",
    "Release Track Name",
    "RELEASE TRACK NAME",

    "work_title",
    "Work Title",
    "WORK TITLE",

    "recording",
    "Recording",
    "RECORDING",
  ]);

  const artist = pickFirstString(raw, [
    "artist",
    "Artist",
    "ARTIST",

    "artist_name",
    "Artist Name",
    "ARTIST NAME",

    "track_artist",
    "Track Artist",
    "TRACK ARTIST",

    "main_artist",
    "Main Artist",
    "MAIN ARTIST",

    "performer",
    "Performer",
    "PERFORMER",

    "primary_artist",
    "Primary Artist",
    "PRIMARY ARTIST",
  ]);

  const isrc = normalizeIsrc(
    pickFirstString(raw, [
      "isrc",
      "ISRC",
      "isrc_code",
      "ISRC Code",
      "track_isrc",
      "Track ISRC",
      "sound_recording_code",
      "Sound Recording Code",
    ])
  );

  const currency =
    pickFirstString(raw, [
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

  const territory =
    pickFirstString(raw, [
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