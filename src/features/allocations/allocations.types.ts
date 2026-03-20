export type AllocationRunStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type AllocationBlockerSeverity = "info" | "warning" | "error";

export type AllocationBlockerCode =
  | "ROW_AMOUNT_MISSING"
  | "ROW_CURRENCY_MISSING"
  | "ROW_NOT_MATCHED_TO_WORK"
  | "NO_ACTIVE_SPLITS_FOR_WORK"
  | "SPLITS_NOT_100_PERCENT"
  | "NEGATIVE_ROW_AMOUNT"
  | "DUPLICATE_SPLIT_CONFIGURATION";

export type AllocationRunRecord = {
  id: string;
  company_id: string;
  import_job_id: string;
  status: AllocationRunStatus;
  engine_version: string;
  input_row_count: number;
  allocated_row_count: number;
  blocker_count: number;
  gross_amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  currency: string | null;
  idempotency_key: string | null;
  started_at: string;
  completed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AllocationRunLineRecord = {
  id: string;
  company_id: string;
  allocation_run_id: string;
  import_job_id: string;
  import_row_id: string;
  work_id: string | null;
  party_id: string;
  role: string;
  source_split_id: string | null;
  row_amount: number;
  share_bps: number;
  allocated_amount: number;
  currency: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AllocationRunBlockerRecord = {
  id: string;
  company_id: string;
  allocation_run_id: string;
  import_job_id: string;
  import_row_id: string | null;
  blocker_code: AllocationBlockerCode | string;
  severity: AllocationBlockerSeverity;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type AllocationPartyTotal = {
  party_id: string;
  party_name: string | null;
  currency: string | null;
  total_allocated_amount: number;
  line_count: number;
};

export type ImportRowForAllocation = {
  id: string;
  company_id: string;
  import_job_id: string;
  row_number: number | null;
  amount: number | null;
  currency: string | null;
  matched_work_id: string | null;
  matched_work_confidence: number | null;
  raw_json: Record<string, unknown> | null;
};

export type WorkSplitRecord = {
  id: string;
  company_id: string;
  work_id: string;
  party_id: string;
  role: string;
  share_bps: number;
  recoupable: boolean;
  effective_from: string | null;
  effective_to: string | null;
  priority: number;
  notes: string | null;
};

export type AllocationCandidateLine = {
  company_id: string;
  allocation_run_id: string;
  import_job_id: string;
  import_row_id: string;
  work_id: string | null;
  party_id: string;
  role: string;
  source_split_id: string | null;
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
  blocker_code: AllocationBlockerCode | string;
  severity: AllocationBlockerSeverity;
  message: string;
  details: Record<string, unknown>;
};

export type AllocationExecutionResult = {
  runId: string;
  status: AllocationRunStatus;
  inputRowCount: number;
  allocatedRowCount: number;
  blockerCount: number;
  grossAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  currency: string | null;
};