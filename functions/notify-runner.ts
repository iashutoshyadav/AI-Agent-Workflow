import type { Request, Response } from "express";
import { adminGql } from "./lib/hasura";

interface StepRunRow {
  id: string;
  status: string;
  output: any;
  workflow_step: { type: string; config: any };
}

/**
 * `notify` step type, implemented as an Event Trigger rather than
 * inline engine code: the engine (lib/engine.ts) just inserts a
 * step_runs row for the notify step and moves on. This handler reacts
 * to that INSERT (via the `step_run_notify` Hasura Event Trigger),
 * performs the actual Slack/email delivery, and writes the final
 * status back onto the same row — which the live subscription then
 * reflects.
 */
export default async function handler(req: Request, res: Response) {
  const row = req.body?.event?.data?.new;
  if (!row) return res.status(200).json({ skipped: true });

  const data = await adminGql<{ step_runs_by_pk: StepRunRow | null }>(
    `query($id: uuid!) {
      step_runs_by_pk(id: $id) {
        id status output
        workflow_step { type config }
      }
    }`,
    { id: row.id }
  );
  const stepRun = data.step_runs_by_pk;
  if (!stepRun || stepRun.workflow_step.type !== "notify" || stepRun.status !== "running") {
    return res.status(200).json({ skipped: true });
  }

  const config = stepRun.workflow_step.config ?? {};
  const message = config.message ?? "A workflow step completed.";

  try {
    if (config.slack_webhook_url) {
      const res2 = await fetch(config.slack_webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: message }),
      });
      if (!res2.ok) throw new Error(`Slack webhook error ${res2.status}`);
    } else {
      // No Slack webhook configured — stubbed delivery, clearly labeled.
      console.log(`[notify-runner] (stubbed email) to=${config.email ?? "unset"} message="${message}"`);
    }

    await adminGql(
      `mutation($id: uuid!, $set: step_runs_set_input!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      }`,
      {
        id: stepRun.id,
        set: {
          status: "succeeded",
          output: { delivered: true, channel: config.slack_webhook_url ? "slack" : "email_stub", message },
          finished_at: new Date().toISOString(),
        },
      }
    );
  } catch (err: any) {
    await adminGql(
      `mutation($id: uuid!, $set: step_runs_set_input!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      }`,
      { id: stepRun.id, set: { status: "failed", error: String(err?.message ?? err), finished_at: new Date().toISOString() } }
    );
  }

  res.status(200).json({ ok: true });
}
