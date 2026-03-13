import "server-only";

export type RawCsvRow = Record<string, string>;

export type ParsedWorkImportRow = {
  rowNumber: number;
  title: string;
  isrc: string;
};

export type WorkImportResult = {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  insertedOrUpdated: number;
  errors: Array<{
    rowNumber: number;
    message: string;
  }>;
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");
}

function normalizeCell(value: string | undefined): string {
  return (value ?? "").trim();
}

function normalizeIsrc(value: string | undefined): string {
  return normalizeCell(value).toUpperCase();
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

export function parseCsvText(csvText: string): RawCsvRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) return [];

  const rawHeaders = splitCsvLine(lines[0]);
  const headers = rawHeaders.map((h) => h.trim());

  const rows: RawCsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row: RawCsvRow = {};

    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = values[j] ?? "";
    }

    rows.push(row);
  }

  return rows;
}

function getValue(row: RawCsvRow, aliases: string[]): string {
  const normalizedMap = new Map<string, string>();

  for (const [key, value] of Object.entries(row)) {
    normalizedMap.set(normalizeHeader(key), value);
  }

  for (const alias of aliases) {
    const value = normalizedMap.get(normalizeHeader(alias));
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function parseWorkImportRows(rows: RawCsvRow[]): {
  parsed: ParsedWorkImportRow[];
  errors: Array<{ rowNumber: number; message: string }>;
} {
  const parsed: ParsedWorkImportRow[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;

    const title = normalizeCell(
      getValue(row, ["title", "track", "track_title", "work_title", "name", "product"])
    );

    const isrc = normalizeIsrc(
      getValue(row, ["isrc", "asset_isrc"])
    );

    if (!title && !isrc) {
      errors.push({
        rowNumber,
        message: "Missing both title and ISRC",
      });
      continue;
    }

    if (!isrc) {
      errors.push({
        rowNumber,
        message: "Missing ISRC",
      });
      continue;
    }

    if (!title) {
      errors.push({
        rowNumber,
        message: "Missing title",
      });
      continue;
    }

    parsed.push({
      rowNumber,
      title,
      isrc,
    });
  }

  return { parsed, errors };
}