export type AllocationRunStatus = "running" | "completed" | "failed";

export type MatchedImportRowForAllocation = {
  id: string;
  company_id: string;
  import_job_id: string;
  matched_work_id: string;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  status: string;
};

export type WorkSplitRecord = {
  work_id: string;
  party_id: string;
  share_percent: number;
};

export type AllocationLineInsert = {
  company_id: string;
  allocation_run_id: string;
  import_job_id: string;
  import_row_id: string;
  work_id: string;
  party_id: string;
  currency: string;
  source_amount: number;
  allocated_amount: number;
  split_percent: number;
  amount_type: "net" | "gross";
};

export type AllocationRunResult = {
  allocationRunId: string;
  totalRows: number;
  allocatedRows: number;
  blockedRows: number;
  totalNetAmount: number;
  totalGrossAmount: number;
};