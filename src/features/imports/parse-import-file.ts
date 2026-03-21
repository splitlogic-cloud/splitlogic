import "server-only";

import Papa from "papaparse";
import { detectImportSource } from "./source-adapters";
import type { RawImportRow, RawImportValue } from "@/features/imports/imports-types";

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

export async function parseImportFile(fileText: string): Promise<ParsedImportFile> {
  let parsed = parseWithDelimiter(fileText);

  const blockingErrors = parsed.errors.filter(
    (e) => e.code !== "UndetectableDelimiter"
  );

  if (blockingErrors.length > 0) {
    throw new Error(
      `CSV parse failed: ${blockingErrors.map((e) => e.message).join("; ")}`
    );
  }

  let rows = parsed.data.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim() !== "")
  );

  let headers = Object.keys(rows[0] ?? {});

  const looksLikeSingleColumn =
    headers.length <= 1 &&
    rows.length > 0 &&
    Object.values(rows[0] ?? {}).some(
      (value) => typeof value === "string" && String(value).includes(";")
    );

  if (rows.length === 0 || looksLikeSingleColumn) {
    const semicolonParsed = parseWithDelimiter(fileText, ";");

    const semicolonBlockingErrors = semicolonParsed.errors.filter(
      (e) => e.code !== "UndetectableDelimiter"
    );

    if (semicolonBlockingErrors.length > 0) {
      throw new Error(
        `CSV parse failed: ${semicolonBlockingErrors.map((e) => e.message).join("; ")}`
      );
    }

    parsed = semicolonParsed;
    rows = parsed.data.filter((row) =>
      Object.values(row).some((value) => String(value ?? "").trim() !== "")
    );
    headers = Object.keys(rows[0] ?? {});
  }

  const normalizedRows: RawImportRow[] = rows.map((row) => {
    const normalized: RawImportRow = {};

    for (const [key, value] of Object.entries(row)) {
      normalized[key] = toRawImportValue(value);
    }

    return normalized;
  });

  const sourceKey = detectImportSource(headers);

  return {
    sourceKey,
    rows: normalizedRows,
    headers,
  };
}