import { adminGql } from "./hasura";
import { HttpError } from "./auth";
import { getOrgQuota } from "./runs-db";
import { runWorkflow } from "./engine";

export interface WorkflowLookup {
  id: string;
  org_id: string;
}

export async function getWorkflowOrThrow(workflowId: string): Promise<WorkflowLookup> {
  const data = await adminGql<{ workflows_by_pk: WorkflowLookup | null }>(
    `query($id: uuid!) { workflows_by_pk(id: $id) { id org_id } }`,
    { id: workflowId }
  );
  if (!data.workflows_by_pk) throw new HttpError(404, "Workflow not found");
  return data.workflows_by_pk;
}

export async function startRun(
  workflow: WorkflowLookup,
  triggerType: "manual" | "webhook" | "scheduled" | "event",
  triggeredBy: string | null
): Promise<{ workflow_run_id: string; status: string }> {
  const quota = await getOrgQuota(workflow.org_id);
  if (quota.quota_calls_used >= quota.quota_calls_allowed) {
    throw new HttpError(402, "Organization quota exhausted for this period");
  }

  const runData = await adminGql<{ insert_workflow_runs_one: { id: string } }>(
    `mutation($object: workflow_runs_insert_input!) {
      insert_workflow_runs_one(object: $object) { id }
    }`,
    {
      object: {
        workflow_id: workflow.id,
        status: "pending",
        trigger_type: triggerType,
        triggered_by: triggeredBy,
      },
    }
  );
  const workflowRunId = runData.insert_workflow_runs_one.id;
  const status = await runWorkflow(workflowRunId);
  return { workflow_run_id: workflowRunId, status };
}
