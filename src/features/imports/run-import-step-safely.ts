import "server-only";

import {
  completeImportStep,
  failImportStep,
  startImportStep,
} from "@/features/imports/imports-reliability.repo";
import type { ImportStep } from "@/features/imports/imports-reliability-types";

type NextStatus = "parsed" | "matched" | "completed";

export async function runImportStepSafely<TResult>(params: {
  importJobId: string;
  companyId: string;
  step: ImportStep;
  nextJobStatus: NextStatus;
  idempotencyKey?: string | null;
  work: (ctx: { runToken: string }) => Promise<TResult>;
  payload?: (result: TResult) => Record<string, unknown>;
}): Promise<TResult> {
  const started = await startImportStep({
    importJobId: params.importJobId,
    companyId: params.companyId,
    step: params.step,
    idempotencyKey: params.idempotencyKey ?? null,
  });

  try {
    const result = await params.work({ runToken: started.runToken });

    await completeImportStep({
      importJobId: params.importJobId,
      companyId: params.companyId,
      step: params.step,
      runToken: started.runToken,
      nextJobStatus: params.nextJobStatus,
      payload: params.payload ? params.payload(result) : {},
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import step failure";

    await failImportStep({
      importJobId: params.importJobId,
      companyId: params.companyId,
      step: params.step,
      runToken: started.runToken,
      error: message,
    });

    throw error;
  }
}