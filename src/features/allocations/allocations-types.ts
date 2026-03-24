export type AllocationRunStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type AllocationRunResult = {
  id: string;
  status: AllocationRunStatus | string;
  created_at?: string | null;
  finished_at?: string | null;
};

export type MatchedImportRowForAllocation = {
  id: string;
  company_id: string;
  import_job_id: string;
  matched_work_id: string | null;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  status: string | null;
};

export type ImportRowForAllocation = {
  id: string;
  company_id: string;
  import_job_id: string;
  row_number: number | null;
  status: string | null;
  matched_work_id: string | null;
  matched_work_confidence: number | null;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  amount: number | null;
};

export type WorkSplitRecord = {
  id: string;
  work_id: string;
  party_id: string;
  share_bps: number;
  role: string | null;
  recoupable: boolean | null;
  priority: number | null;
};

export type AllocationLineInsert = {
  allocation_run_id: string;
  company_id: string;
  import_job_id: string;
  import_row_id: string;
  work_id: string | null;
  party_id: string;
  role?: string | null;
  source_split_id?: string | null;
  row_amount?: number | null;
  share_bps?: number | null;
  allocated_amount: number;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AllocationCandidateLine = {
  company_id: string;
  allocation_run_id: string;
  import_job_id: string;
  import_row_id: string;
  work_id: string | null;
  party_id: string;
  role: string | null;
  source_split_id: string;
  row_amount: number;
  share_bps: number;
  allocated_amount: number;
  currency: string | null;
  metadata: Record<string, unknown>;
};

export type AllocationCandidateBlocker = {
  company_id: string;
  allocation_run_id: string;
  import_job_id: string;
  import_row_id: string | null;
  blocker_code: string;
  severity: "info" | "warning" | "error";
  message: string;
  details: Record<string, unknown>;
};

export type AllocationExecutionResult = {
  runId: string;
  status: "completed" | "failed";
  inputRowCount: number;
  allocatedRowCount: number;
  blockerCount: number;
  grossAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  currency: string | null;
};