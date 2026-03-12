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

function parseCsvMatrix(text: string): string[][] {
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

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

  const hasLastRowContent =
    currentRow.length > 1 || currentRow.some((cell) => cell.trim().length > 0);

  if (hasLastRowContent) {
    rows.push(currentRow);
  }

  return rows;
}

function padOrTrimRow(values: string[], targetLength: number): string[] {
  if (values.length === targetLength) return values;

  if (values.length < targetLength) {
    return [...values, ...Array.from({ length: targetLength - values.length }, () => "")];
  }

  return values.slice(0, targetLength);
}

export function parseCsvText(text: string): ParsedCsvRow[] {
  const matrix = parseCsvMatrix(text);

  if (matrix.length === 0) {
    return [];
  }

  const rawHeaders = matrix[0];
  const headers = rawHeaders.map((header, index) => {
    const normalized = normalizeHeader(header);
    return normalized || `column_${index + 1}`;
  });

  const expectedColumnCount = headers.length;
  const parsedRows: ParsedCsvRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const originalValues = matrix[i];
    const values = padOrTrimRow(originalValues, expectedColumnCount);

    const raw: Record<string, string> = {};

    for (let c = 0; c < expectedColumnCount; c++) {
      raw[headers[c]] = (values[c] ?? "").trim();
    }

    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    const isEmptyRow = Object.values(raw).every((v) => !v.trim());

    if (isEmptyRow) {
      errorCode = "empty_row";
      errorMessage = "CSV row is empty";
    } else if (originalValues.length !== expectedColumnCount) {
      errorCode = "column_count_mismatch";
      errorMessage = `Expected ${expectedColumnCount} columns, got ${originalValues.length}`;
    }

    parsedRows.push({
      rowIndex: i,
      raw,
      errorCode,
      errorMessage,
    });
  }

  return parsedRows;
}