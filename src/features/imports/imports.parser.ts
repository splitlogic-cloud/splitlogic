import "server-only";

export type ParsedCsvRow = {
  rowIndex: number;
  raw: Record<string, string>;
  errorCode: string | null;
  errorMessage: string | null;
};

function normalizeHeader(header: string): string {
  return header
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalizedText.length; i++) {
    const ch = normalizedText[i];
    const next = normalizedText[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (ch === "\n" && !inQuotes) {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += ch;
  }

  currentRow.push(currentCell);

  const hasAnyValue =
    currentRow.length > 1 || currentRow[0]?.trim().length > 0;

  if (hasAnyValue) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseCsvText(text: string): ParsedCsvRow[] {
  const matrix = parseCsv(text);

  if (matrix.length === 0) {
    return [];
  }

  const headers = matrix[0].map((header, index) => {
    const normalized = normalizeHeader(header);
    return normalized || `column_${index + 1}`;
  });

  const rows: ParsedCsvRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i];

    const raw: Record<string, string> = {};

    for (let c = 0; c < headers.length; c++) {
      raw[headers[c]] = (values[c] ?? "").trim();
    }

    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    const isEmptyRow = Object.values(raw).every((v) => !v.trim());

    if (isEmptyRow) {
      errorCode = "empty_row";
      errorMessage = "CSV row is empty";
    }

    rows.push({
      rowIndex: i,
      raw,
      errorCode,
      errorMessage,
    });
  }

  return rows;
}