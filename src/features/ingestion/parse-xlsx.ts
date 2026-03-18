import * as XLSX from "xlsx";
import { ParsedMatrix } from "./types";

function scoreHeaderRow(row: string[]): number {
  const joined = row.join(" ").toLowerCase();

  let score = 0;
  const signals = [
    "title",
    "track",
    "artist",
    "isrc",
    "upc",
    "amount",
    "revenue",
    "earnings",
    "currency",
    "territory",
    "country",
    "quantity",
    "store",
    "service",
  ];

  for (const signal of signals) {
    if (joined.includes(signal)) score += 1;
  }

  return score;
}

export function parseWorkbook(buffer: Buffer): ParsedMatrix & { sheetName: string } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;

  let bestSheetName = sheetNames[0] ?? "Sheet1";
  let bestRows: string[][] = [];
  let bestHeaderRowIndex = 0;
  let bestScore = -1;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    const rows = matrix.map((row) => row.map((cell) => String(cell ?? "").trim()));
    if (rows.length === 0) continue;

    for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
      const score = scoreHeaderRow(rows[i]);
      if (score > bestScore) {
        bestScore = score;
        bestSheetName = sheetName;
        bestRows = rows;
        bestHeaderRowIndex = i;
      }
    }
  }

  return {
    rows: bestRows,
    headerRowIndex: bestHeaderRowIndex,
    headers: bestRows[bestHeaderRowIndex] ?? [],
    sheetName: bestSheetName,
  };
}