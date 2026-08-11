import type { Request, Response } from "express";
import parser from "cron-parser";
import { adminGql } from "./lib/hasura";
import { getWorkflowOrThrow, startRun } from "./lib/start-run";

interface TriggerRow {
  id: string;
  workflow_id: string;
  config: { cron?: string; last_run_at?: string };
}

export default async function handler(_req: Request, res: Response) {
  const data = await adminGql<{ workflow_triggers: TriggerRow[] }>(
    `query {
      workflow_triggers(where: { type: { _eq: "scheduled" }, is_active: { _eq: true } }) {
        id workflow_id config
      }
    }`
  );

  const results: Array<{ trigger_id: string; started: boolean; workflow_run_id?: string }> = [];

  for (const trigger of data.workflow_triggers) {
    const cronExpr = trigger.config?.cron;
    if (!cronExpr) continue;

    try {
      const lastRunAt = trigger.config.last_run_at
        ? new Date(trigger.config.last_run_at)
        : new Date(Date.now() - 5 * 60 * 1000);
      const interval = parser.parseExpression(cronExpr, { currentDate: lastRunAt });
      const nextFire = interval.next().toDate();

      if (nextFire <= new Date()) {
        const workflow = await getWorkflowOrThrow(trigger.workflow_id);
        const { workflow_run_id } = await startRun(workflow, "scheduled", null);
        await adminGql(
          `mutation($id: uuid!, $config: jsonb!) {
            update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { config: $config }) { id }
          }`,
          { id: trigger.id, config: { ...trigger.config, last_run_at: new Date().toISOString() } }
        );
        results.push({ trigger_id: trigger.id, started: true, workflow_run_id });
      }
    } catch (err) {
      console.error(`scheduled-runner: trigger ${trigger.id} failed`, err);
      results.push({ trigger_id: trigger.id, started: false });
    }
  }

  res.status(200).json({ checked: data.workflow_triggers.length, results });
}
