import type { Request, Response } from "express";
import { getRealRole, requireRole, getSessionUserId, HttpError } from "./lib/auth";
import { getWorkflowOrThrow, startRun } from "./lib/start-run";

export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const userId = getSessionUserId(session_variables);
    const workflowId: string = input.workflow_id;

    const workflow = await getWorkflowOrThrow(workflowId);

    const role = await getRealRole(userId, workflow.org_id);
    requireRole(role, ["owner", "editor"]);

    const { workflow_run_id, status } = await startRun(workflow, "manual", userId);

    res.status(200).json({ workflow_run_id, status });
  } catch (err: any) {
    const statusCode = err instanceof HttpError ? err.statusCode : 500;
    res.status(statusCode).json({ message: err.message ?? "Internal error" });
  }
}
