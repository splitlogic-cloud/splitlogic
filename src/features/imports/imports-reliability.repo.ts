import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  CompleteImportStepParams,
  FailImportStepParams,
  ImportStep,
  StartImportStepResult,
} from "./imports-reliability-types";

function stepToJobStatus(step: ImportStep): string {
  if (step === "parse") return "parsing";
  if (step === "match") return "matching";
  return "allocating";
}

function stepStartedAtColumn(step: ImportStep): string {
  if (step === "parse") return "parsing_started_at";
  if (step === "match") return "matching_started_at";
  return "allocation_started_at";
}

function stepFinishedAtColumn(step: ImportStep): string {
  if (step === "parse") return "parsing_finished_at";
  if (step === "match") return "matching_finished_at";
  return "allocation_finished_at";
}

export async function startImportStep(params: {
  importJobId: string;
  companyId: string;
  step: ImportStep;
  idempotencyKey?: string | null;
}): Promise<StartImportStepResult> {
  const runToken = randomUUID();

  const { data: job, error: loadError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, status, active_run_token, version")
    .eq("id", params.importJobId)
    .eq("company_id", params.companyId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`startImportStep load job failed: ${loadError.message}`);
  }

  if (!job) {
    throw new Error("Import job not found");
  }

  if (job.active_run_token) {
    throw new Error(
      `Import job already has an active run token. Another step is currently running.`
    );
  }

  const startedAtColumn = stepStartedAtColumn(params.step);

  const updatePayload: Record<string, unknown> = {
    status: stepToJobStatus(params.step),
    current_step: params.step,
    active_run_token: runToken,
    locked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: Number(job.version ?? 0) + 1,
    last_error: null,
  };

  updatePayload[startedAtColumn] = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("import_jobs")
    .update(updatePayload)
    .eq("id", params.importJobId)
    .eq("company_id", params.companyId)
    .is("active_run_token", null);

  if (updateError) {
    throw new Error(`startImportStep update job failed: ${updateError.message}`);
  }

  const { error: insertRunError } = await supabaseAdmin
    .from("import_job_step_runs")
    .insert({
      import_job_id: params.importJobId,
      company_id: params.companyId,
      step: params.step,
      status: "started",
      run_token: runToken,
      idempotency_key: params.idempotencyKey ?? null,
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

  if (insertRunError) {
    throw new Error(`startImportStep insert step run failed: ${insertRunError.message}`);
  }

  const { error: eventError } = await supabaseAdmin
    .from("import_job_events")
    .insert({
      import_job_id: params.importJobId,
      company_id: params.companyId,
      type: `${params.step}_started`,
      payload: {
        step: params.step,
        runToken,
        idempotencyKey: params.idempotencyKey ?? null,
      },
      created_at: new Date().toISOString(),
    });

  if (eventError) {
    throw new Error(`startImportStep insert event failed: ${eventError.message}`);
  }

  return { runToken };
}

export async function completeImportStep(
  params: CompleteImportStepParams & {
    nextJobStatus: "parsed" | "matched" | "completed";
  }
): Promise<void> {
  const finishedAtColumn = stepFinishedAtColumn(params.step);

  const stepRunUpdate = await supabaseAdmin
    .from("import_job_step_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
    })
    .eq("import_job_id", params.importJobId)
    .eq("company_id", params.companyId)
    .eq("step", params.step)
    .eq("run_token", params.runToken)
    .eq("status", "started");

  if (stepRunUpdate.error) {
    throw new Error(
      `completeImportStep update step run failed: ${stepRunUpdate.error.message}`
    );
  }

  const jobUpdatePayload: Record<string, unknown> = {
    status: params.nextJobStatus,
    current_step: null,
    active_run_token: null,
    locked_at: null,
    updated_at: new Date().toISOString(),
  };

  jobUpdatePayload[finishedAtColumn] = new Date().toISOString();

  if (params.nextJobStatus === "completed") {
    jobUpdatePayload["completed_at"] = new Date().toISOString();
  }

  const jobUpdate = await supabaseAdmin
    .from("import_jobs")
    .update(jobUpdatePayload)
    .eq("id", params.importJobId)
    .eq("company_id", params.companyId)
    .eq("active_run_token", params.runToken);

  if (jobUpdate.error) {
    throw new Error(`completeImportStep update job failed: ${jobUpdate.error.message}`);
  }

  const { error: eventError } = await supabaseAdmin
    .from("import_job_events")
    .insert({
      import_job_id: params.importJobId,
      company_id: params.companyId,
      type: `${params.step}_completed`,
      payload: {
        step: params.step,
        runToken: params.runToken,
        ...(params.payload ?? {}),
      },
      created_at: new Date().toISOString(),
    });

  if (eventError) {
    throw new Error(`completeImportStep insert event failed: ${eventError.message}`);
  }
}

export async function failImportStep(params: FailImportStepParams): Promise<void> {
  const stepRunUpdate = await supabaseAdmin
    .from("import_job_step_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: params.error,
    })
    .eq("import_job_id", params.importJobId)
    .eq("company_id", params.companyId)
    .eq("step", params.step)
    .eq("run_token", params.runToken)
    .eq("status", "started");

  if (stepRunUpdate.error) {
    throw new Error(`failImportStep update step run failed: ${stepRunUpdate.error.message}`);
  }

  const jobUpdate = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "failed",
      current_step: null,
      active_run_token: null,
      locked_at: null,
      failed_at: new Date().toISOString(),
      last_error: params.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.importJobId)
    .eq("company_id", params.companyId)
    .eq("active_run_token", params.runToken);

  if (jobUpdate.error) {
    throw new Error(`failImportStep update job failed: ${jobUpdate.error.message}`);
  }

  const { error: eventError } = await supabaseAdmin
    .from("import_job_events")
    .insert({
      import_job_id: params.importJobId,
      company_id: params.companyId,
      type: `${params.step}_failed`,
      payload: {
        step: params.step,
        runToken: params.runToken,
        error: params.error,
        ...(params.payload ?? {}),
      },
      created_at: new Date().toISOString(),
    });

  if (eventError) {
    throw new Error(`failImportStep insert event failed: ${eventError.message}`);
  }
}