import type { Request, Response } from "express";
import { adminGql } from "./lib/hasura";
import { getWorkflowOrThrow, startRun } from "./lib/start-run";

interface TriggerRow {
  id: string;
  workflow_id: string;
  config: { source?: string };
}

export default async function handler(req: Request, res: Response) {
  const row = req.body?.event?.data?.new;
  if (!row) return res.status(200).json({ started: 0 });

  const data = await adminGql<{ workflow_triggers: TriggerRow[] }>(
    `query($orgId: uuid!) {
      workflow_triggers(where: { type: { _eq: "event" }, is_active: { _eq: true }, org_id: { _eq: $orgId } }) {
        id workflow_id config
      }
    }`,
    { orgId: row.org_id }
  );

  const matches = data.workflow_triggers.filter((t) => (t.config?.source ?? "*") === row.source || t.config?.source === "*");

  const started: string[] = [];
  for (const trigger of matches) {
    const workflow = await getWorkflowOrThrow(trigger.workflow_id);
    const { workflow_run_id } = await startRun(workflow, "event", null);
    started.push(workflow_run_id);
  }

  res.status(200).json({ started: started.length, workflow_run_ids: started });
}
