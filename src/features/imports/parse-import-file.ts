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

export async function parseImportFile(fileText: string): Promise<ParsedImportFile> {
  const parsed = Papa.parse<Record<string, unknown>>(fileText, {
    header: true,
    skipEmptyLines: true,
    transformHeader(header) {
      return normalizeHeader(header);
    },
  });

  if (parsed.errors.length > 0) {
    throw new Error(
      `CSV parse failed: ${parsed.errors.map((e) => e.message).join("; ")}`
    );
  }

  const rows = parsed.data
    .filter((row) =>
      Object.values(row).some((value) => String(value ?? "").trim() !== "")
    )
    .map((row) => {
      const normalized: RawImportRow = {};

      for (const [key, value] of Object.entries(row)) {
        normalized[key] = toRawImportValue(value);
      }

      return normalized;
    });

  const headers = Object.keys(rows[0] ?? {});
  const sourceKey = detectImportSource(headers);

  return {
    sourceKey,
    rows,
    headers,
  };
}