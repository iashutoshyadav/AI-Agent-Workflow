import type { Request, Response } from "express";
import { adminGql } from "./lib/hasura";
import { getRealRole, requireRole, getSessionUserId, HttpError } from "./lib/auth";
import { updateWorkflowRun } from "./lib/runs-db";
import { runWorkflow } from "./lib/engine";

interface StepRunRow {
  id: string;
  status: string;
  workflow_run_id: string;
  org_id: string;
  workflow_step: { type: string };
}

export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const userId = getSessionUserId(session_variables);
    const { step_run_id: stepRunId, approve, reason } = input;

    const data = await adminGql<{ step_runs_by_pk: StepRunRow | null }>(
      `query($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id status workflow_run_id org_id
          workflow_step { type }
        }
      }`,
      { id: stepRunId }
    );
    const stepRun = data.step_runs_by_pk;
    if (!stepRun) throw new HttpError(404, "step_run not found");
    if (stepRun.workflow_step.type !== "approval_gate") {
      throw new HttpError(400, "step_run is not an approval_gate step");
    }
    if (stepRun.status !== "paused") {
      throw new HttpError(409, `step_run is not paused (status: ${stepRun.status})`);
    }

    const role = await getRealRole(userId, stepRun.org_id);
    requireRole(role, ["owner", "editor"]);

    const now = new Date().toISOString();

    if (!approve) {
      await adminGql(
        `mutation($id: uuid!, $set: step_runs_set_input!) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
        }`,
        {
          id: stepRunId,
          set: {
            status: "failed",
            approved_by: userId,
            approved_at: now,
            error: reason ?? "Rejected at approval gate",
            finished_at: now,
          },
        }
      );
      await updateWorkflowRun(stepRun.workflow_run_id, { status: "failed", finished_at: now });
      return res.status(200).json({ step_run_id: stepRunId, workflow_run_id: stepRun.workflow_run_id, status: "failed" });
    }

    await adminGql(
      `mutation($id: uuid!, $set: step_runs_set_input!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      }`,
      {
        id: stepRunId,
        set: {
          status: "succeeded",
          approved_by: userId,
          approved_at: now,
          finished_at: now,
          output: { approved: true },
        },
      }
    );
    await updateWorkflowRun(stepRun.workflow_run_id, { status: "running" });

    const status = await runWorkflow(stepRun.workflow_run_id);

    res.status(200).json({ step_run_id: stepRunId, workflow_run_id: stepRun.workflow_run_id, status });
  } catch (err: any) {
    const statusCode = err instanceof HttpError ? err.statusCode : 500;
    res.status(statusCode).json({ message: err.message ?? "Internal error" });
  }
}
