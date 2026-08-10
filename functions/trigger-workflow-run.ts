import type { Request, Response } from "express";
import { getRealRole, requireRole, getSessionUserId, HttpError } from "./lib/auth";
import { getWorkflowOrThrow, startRun } from "./lib/start-run";

/**
 * Hasura Action handler for `triggerWorkflowRun(workflow_id)`.
 *
 * Order of checks matters and mirrors the assignment spec exactly:
 *  1. caller is owner/editor in the workflow's org (fresh DB lookup)
 *  2. org quota isn't exhausted
 *  3. create the workflow_run
 *  4. execute steps in order, live-updating step_runs as it goes
 *  5. increment quota usage on completion
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const userId = getSessionUserId(session_variables);
    const workflowId: string = input.workflow_id;

    const workflow = await getWorkflowOrThrow(workflowId);

    // Layer 2, for real: ignore session_variables['x-hasura-role'] —
    // derive the caller's actual role in THIS org from org_members.
    const role = await getRealRole(userId, workflow.org_id);
    requireRole(role, ["owner", "editor"]);

    const { workflow_run_id, status } = await startRun(workflow, "manual", userId);

    res.status(200).json({ workflow_run_id, status });
  } catch (err: any) {
    const statusCode = err instanceof HttpError ? err.statusCode : 500;
    res.status(statusCode).json({ message: err.message ?? "Internal error" });
  }
}
