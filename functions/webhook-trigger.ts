import type { Request, Response } from "express";
import crypto from "node:crypto";
import { adminGql } from "./lib/hasura";
import { HttpError } from "./lib/auth";
import { getWorkflowOrThrow, startRun } from "./lib/start-run";

interface TriggerRow {
  id: string;
  config: { secret?: string };
  is_active: boolean;
}

export default async function handler(req: Request, res: Response) {
  try {
    const { workflow_id: workflowId, token } = req.body ?? {};
    if (!workflowId || !token) {
      throw new HttpError(400, "workflow_id and token are required");
    }

    const workflow = await getWorkflowOrThrow(workflowId);

    const data = await adminGql<{ workflow_triggers: TriggerRow[] }>(
      `query($workflowId: uuid!) {
        workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: "webhook" }, is_active: { _eq: true } }) {
          id config is_active
        }
      }`,
      { workflowId }
    );
    const trigger = data.workflow_triggers[0];
    if (!trigger?.config?.secret) {
      throw new HttpError(404, "No active webhook trigger configured for this workflow");
    }

    if (!timingSafeEqualStrings(token, trigger.config.secret)) {
      throw new HttpError(401, "Invalid webhook token");
    }

    const { workflow_run_id, status } = await startRun(workflow, "webhook", null);
    res.status(202).json({ workflow_run_id, status });
  } catch (err: any) {
    const statusCode = err instanceof HttpError ? err.statusCode : 500;
    res.status(statusCode).json({ message: err.message ?? "Internal error" });
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
