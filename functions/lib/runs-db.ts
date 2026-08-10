import { adminGql } from "./hasura";

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  org_id: string;
  status: string;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  org_id: string;
  position: number;
  type: string;
  name: string;
  config: any;
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  status: string;
  output: unknown;
  attempt_count: number;
}

export async function getWorkflowRun(id: string): Promise<WorkflowRun | null> {
  const data = await adminGql<{ workflow_runs_by_pk: WorkflowRun | null }>(
    `query($id: uuid!) { workflow_runs_by_pk(id: $id) { id workflow_id org_id status } }`,
    { id }
  );
  return data.workflow_runs_by_pk;
}

export async function updateWorkflowRun(id: string, set: Record<string, unknown>): Promise<void> {
  await adminGql(
    `mutation($id: uuid!, $set: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
    }`,
    { id, set }
  );
}

export async function getOrderedSteps(workflowId: string): Promise<WorkflowStep[]> {
  const data = await adminGql<{ workflow_steps: WorkflowStep[] }>(
    `query($workflowId: uuid!) {
      workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { position: asc }) {
        id workflow_id org_id position type name config
      }
    }`,
    { workflowId }
  );
  return data.workflow_steps;
}

export async function getStepRunsForRun(workflowRunId: string): Promise<StepRun[]> {
  const data = await adminGql<{ step_runs: StepRun[] }>(
    `query($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { created_at: asc }) {
        id workflow_run_id workflow_step_id status output attempt_count
      }
    }`,
    { runId: workflowRunId }
  );
  return data.step_runs;
}

export async function createStepRun(
  workflowRunId: string,
  step: WorkflowStep,
  input: unknown,
  status: "running" | "paused" = "running"
): Promise<{ id: string }> {
  const data = await adminGql<{ insert_step_runs_one: { id: string } }>(
    `mutation($object: step_runs_insert_input!) {
      insert_step_runs_one(object: $object) { id }
    }`,
    {
      object: {
        workflow_run_id: workflowRunId,
        workflow_step_id: step.id,
        org_id: step.org_id,
        status,
        input,
        started_at: new Date().toISOString(),
      },
    }
  );
  return data.insert_step_runs_one;
}

export async function finishStepRun(
  stepRunId: string,
  status: "succeeded" | "failed" | "paused" | "skipped",
  output: unknown,
  attemptCount = 0,
  error: string | null = null
): Promise<void> {
  await adminGql(
    `mutation($id: uuid!, $set: step_runs_set_input!) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
    }`,
    {
      id: stepRunId,
      set: {
        status,
        output,
        error,
        attempt_count: attemptCount,
        finished_at: ["succeeded", "failed", "skipped"].includes(status)
          ? new Date().toISOString()
          : null,
      },
    }
  );
}

export async function createSkippedStepRun(workflowRunId: string, step: WorkflowStep): Promise<void> {
  await adminGql(
    `mutation($object: step_runs_insert_input!) { insert_step_runs_one(object: $object) { id } }`,
    {
      object: {
        workflow_run_id: workflowRunId,
        workflow_step_id: step.id,
        org_id: step.org_id,
        status: "skipped",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      },
    }
  );
}

export async function getOrgQuota(
  orgId: string
): Promise<{ quota_calls_used: number; quota_calls_allowed: number }> {
  const data = await adminGql<{
    organizations_by_pk: { quota_calls_used: number; quota_calls_allowed: number };
  }>(
    `query($id: uuid!) { organizations_by_pk(id: $id) { quota_calls_used quota_calls_allowed } }`,
    { id: orgId }
  );
  return data.organizations_by_pk;
}

export async function incrementOrgUsage(orgId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await adminGql(
    `mutation($id: uuid!, $amount: Int!) {
      update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_calls_used: $amount }) { id }
    }`,
    { id: orgId, amount }
  );
}
