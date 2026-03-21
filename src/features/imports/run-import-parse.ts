import "server-only";

import { canonicalizeImportRow } from "./canonicalize-import-row";
import {
  getImportJobById,
  getImportJobRowCounts,
  replaceImportRowsForJob,
  setImportJobStatus,
} from "./imports.repo";
import { parseImportFile } from "./parse-import-file";
import { readImportJobFile } from "./read-import-job-file";

export async function runImportParse(importJobId: string): Promise<{
  totalRows: number;
  parsedRows: number;
  invalidRows: number;
}> {
  const importJob = await getImportJobById(importJobId);

  if (!importJob.file_path) {
    await setImportJobStatus(importJobId, "failed");
    throw new Error("Import job has no file_path");
  }

  await setImportJobStatus(importJobId, "parsing");

  try {
    const fileText = await readImportJobFile(importJob.file_path);
    const parsedFile = await parseImportFile(fileText);

    const rows = parsedFile.rows.map((raw, index) => {
      const result = canonicalizeImportRow(raw, parsedFile.sourceKey);

      return {
        rowNumber: index + 1,
        raw,
        normalized: result.normalized,
        canonical: result.canonical,
        currency: result.currency,
        netAmount: result.netAmount,
        grossAmount: result.grossAmount,
        sourceWorkRef: result.sourceWorkRef,
        status: result.rowStatus,
        errorCodes: result.errorCodes,
      };
    });

    await replaceImportRowsForJob(importJob.company_id, importJobId, rows);

    await setImportJobStatus(importJobId, "parsed");

    return await getImportJobRowCounts(importJobId);
  } catch (error) {
    await setImportJobStatus(importJobId, "failed");
    throw error;
  }
}