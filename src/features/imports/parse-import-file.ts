import "server-only";

import Papa from "papaparse";
import { detectImportSource } from "./source-adapters";
import type { RawImportRow, RawImportValue } from "@/features/imports/imports-types";
import { parseDelimitedText } from "@/features/ingestion/parse-delimited";
import { parseWorkbook } from "@/features/ingestion/parse-xlsx";

export type ParsedImportFile = {
  sourceKey: string;
  rows: RawImportRow[];
  headers: string[];
};

function normalizeHeader(header: string): string {
  return String(header)
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function toRawImportValue(value: unknown): RawImportValue {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

function parseWithDelimiter(fileText: string, delimiter?: string) {
  return Papa.parse<Record<string, unknown>>(fileText, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader(header) {
      return normalizeHeader(header);
    },
  });
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();

  return headers.map((header, index) => {
    const base = normalizeHeader(header) || `col_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function buildRowsFromMatrix(matrixRows: string[][], headerRowIndex: number): {
  headers: string[];
  rows: RawImportRow[];
} {
  const rawHeaders = matrixRows[headerRowIndex] ?? [];
  const headers = dedupeHeaders(rawHeaders);

  const rows: RawImportRow[] = [];

  for (let i = headerRowIndex + 1; i < matrixRows.length; i += 1) {
    const sourceRow = matrixRows[i] ?? [];
    const hasContent = sourceRow.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasContent) continue;

    const normalized: RawImportRow = {};
    for (let col = 0; col < headers.length; col += 1) {
      normalized[headers[col]] = toRawImportValue(sourceRow[col] ?? "");
    }
    rows.push(normalized);
  }

  return { headers, rows };
}

function extractBlockingErrors(parsed: Papa.ParseResult<Record<string, unknown>>) {
  return parsed.errors.filter((error) => error.code !== "UndetectableDelimiter");
}

function summarizeErrors(errors: Papa.ParseError[]): string {
  const unique = Array.from(new Set(errors.map((error) => error.message)));
  return unique.slice(0, 6).join("; ");
}

function normalizeRowsFromPapa(
  parsed: Papa.ParseResult<Record<string, unknown>>
): { headers: string[]; rows: RawImportRow[]; looksLikeSingleColumn: boolean } {
  const dataRows = parsed.data.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim() !== "")
  );
  const headers = Object.keys(dataRows[0] ?? {});

  const looksLikeSingleColumn =
    headers.length <= 1 &&
    dataRows.length > 0 &&
    Object.values(dataRows[0] ?? {}).some(
      (value) => typeof value === "string" && String(value).includes(";")
    );

  const rows: RawImportRow[] = dataRows.map((row) => {
    const normalized: RawImportRow = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = toRawImportValue(value);
    }
    return normalized;
  });

  return { headers, rows, looksLikeSingleColumn };
}

function isSpreadsheetFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

export async function parseImportFile(fileText: string): Promise<ParsedImportFile> {
  const autoParsed = parseWithDelimiter(fileText);
  const autoErrors = extractBlockingErrors(autoParsed);
  const autoNormalized = normalizeRowsFromPapa(autoParsed);

  let selectedNormalized = autoNormalized;
  let selectedErrors = autoErrors;

  if (
    autoErrors.length > 0 ||
    autoNormalized.looksLikeSingleColumn ||
    autoNormalized.rows.length === 0
  ) {
    const semicolonParsed = parseWithDelimiter(fileText, ";");
    const semicolonErrors = extractBlockingErrors(semicolonParsed);
    const semicolonNormalized = normalizeRowsFromPapa(semicolonParsed);

    const autoScore =
      (autoErrors.length === 0 ? 1000 : 0) +
      autoNormalized.rows.length -
      (autoNormalized.looksLikeSingleColumn ? 500 : 0) -
      autoErrors.length * 10;
    const semicolonScore =
      (semicolonErrors.length === 0 ? 1000 : 0) +
      semicolonNormalized.rows.length -
      (semicolonNormalized.looksLikeSingleColumn ? 500 : 0) -
      semicolonErrors.length * 10;

    if (semicolonScore > autoScore) {
      selectedNormalized = semicolonNormalized;
      selectedErrors = semicolonErrors;
    }
  }

  if (selectedErrors.length > 0 || selectedNormalized.rows.length === 0) {
    const matrix = parseDelimitedText(fileText);
    const fallback = buildRowsFromMatrix(matrix.rows, matrix.headerRowIndex);

    if (fallback.rows.length > 0) {
      const sourceKey = detectImportSource(fallback.headers);
      return {
        sourceKey,
        rows: fallback.rows,
        headers: fallback.headers,
      };
    }

    throw new Error(`CSV parse failed: ${summarizeErrors(selectedErrors)}`);
  }

  const sourceKey = detectImportSource(selectedNormalized.headers);

  return {
    sourceKey,
    rows: selectedNormalized.rows,
    headers: selectedNormalized.headers,
  };
}

export async function parseImportFileFromBlob(args: {
  fileName: string;
  fileBlob: Blob;
}): Promise<ParsedImportFile> {
  if (isSpreadsheetFileName(args.fileName)) {
    const buffer = Buffer.from(await args.fileBlob.arrayBuffer());
    const workbook = parseWorkbook(buffer);
    const parsed = buildRowsFromMatrix(workbook.rows, workbook.headerRowIndex);

    if (parsed.rows.length === 0) {
      throw new Error("Spreadsheet parse failed: no data rows found.");
    }

    return {
      sourceKey: detectImportSource(parsed.headers),
      rows: parsed.rows,
      headers: parsed.headers,
    };
  }

  const fileText = await args.fileBlob.text();

  if (!fileText.trim()) {
    throw new Error("Import file is empty.");
  }

  return parseImportFile(fileText);
}