export type ImportStep = "parse" | "match" | "allocate";

export type ImportStepRunStatus = "started" | "completed" | "failed";

export type StartImportStepResult = {
  runToken: string;
};

export type CompleteImportStepParams = {
  importJobId: string;
  companyId: string;
  step: ImportStep;
  runToken: string;
  payload?: Record<string, unknown>;
};

export type FailImportStepParams = {
  importJobId: string;
  companyId: string;
  step: ImportStep;
  runToken: string;
  error: string;
  payload?: Record<string, unknown>;
};
