import {
  getWorkflowRun,
  updateWorkflowRun,
  getOrderedSteps,
  getStepRunsForRun,
  createStepRun,
  finishStepRun,
  createSkippedStepRun,
  incrementOrgUsage,
  WorkflowStep,
} from "./runs-db";
import { runLlmCall, runHttpRequest, runDbWrite, evaluateCondition, StepContext } from "./steps";

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

/**
 * Executes a workflow_run's steps in order, starting from wherever it
 * left off. This is called three times over one run's lifetime in the
 * approval-gate scenario: once by triggerWorkflowRun (runs up to the
 * gate and pauses), and once more by approveStep (resumes and runs to
 * completion) — the loop is idempotent about already-finished steps,
 * so "resume" is just "call the same function again."
 */
export async function runWorkflow(workflowRunId: string): Promise<string> {
  const run = await getWorkflowRun(workflowRunId);
  if (!run) throw new Error(`workflow_run ${workflowRunId} not found`);
  if (TERMINAL_RUN_STATUSES.has(run.status)) return run.status;

  if (run.status === "pending") {
    await updateWorkflowRun(workflowRunId, { status: "running", started_at: new Date().toISOString() });
  }

  const steps = await getOrderedSteps(run.workflow_id);
  const existingRuns = await getStepRunsForRun(workflowRunId);
  const stepRunByStepId = new Map(existingRuns.map((sr) => [sr.workflow_step_id, sr]));

  let previousOutput: unknown = null;
  for (const sr of existingRuns) {
    if (sr.status === "succeeded") previousOutput = sr.output;
  }

  let llmOrHttpCallsMade = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const existing = stepRunByStepId.get(step.id);

    if (existing?.status === "succeeded" || existing?.status === "skipped") {
      if (existing.status === "succeeded") previousOutput = existing.output;
      continue;
    }

    if (existing?.status === "paused") {
      // Still waiting on approveStep — nothing more to do right now.
      return "paused";
    }

    if (step.type === "conditional_branch") {
      const stepRunId = existing?.id ?? (await createStepRun(workflowRunId, step, previousOutput)).id;
      const passed = evaluateCondition(step.config, previousOutput);
      const directive = passed ? step.config.on_true : step.config.on_false;
      await finishStepRun(stepRunId, "succeeded", { condition_passed: passed, branch: passed ? "true" : "false" });

      if (directive?.action === "skip_to" && typeof directive.position === "number") {
        const targetIdx = steps.findIndex((s) => s.position === directive.position);
        if (targetIdx > i) {
          for (let j = i + 1; j < targetIdx; j++) {
            if (!stepRunByStepId.get(steps[j].id)) await createSkippedStepRun(workflowRunId, steps[j]);
          }
          i = targetIdx - 1;
        }
      }
      continue;
    }

    if (step.type === "approval_gate") {
      if (!existing) await createStepRun(workflowRunId, step, previousOutput, "paused");
      await updateWorkflowRun(workflowRunId, { status: "paused" });
      return "paused";
    }

    const stepRunId = existing?.id ?? (await createStepRun(workflowRunId, step, previousOutput)).id;
    const ctx: StepContext = {
      orgId: step.org_id,
      workflowRunId,
      stepRunId,
      previousOutput,
    };

    try {
      if (step.type === "notify") {
        // Fire-and-forget: leave status "running" — the
        // `step_run_notify` Hasura Event Trigger on this INSERT is
        // what actually delivers the Slack/email alert and finalizes
        // this step_run's status. The engine doesn't block on it.
        previousOutput = { notify_queued: true, channel: step.config?.channel ?? "slack" };
        continue;
      }

      let output: unknown;

      // llm_call and http_request each retry once internally (see
      // lib/steps.ts) — attempt_count here reflects that a retry
      // happened when the underlying call needed one.
      switch (step.type) {
        case "llm_call":
          output = await runLlmCall(step.config, ctx);
          llmOrHttpCallsMade++;
          break;
        case "http_request":
          output = await runHttpRequest(step.config, ctx);
          llmOrHttpCallsMade++;
          break;
        case "db_write":
          output = await runDbWrite(step.config, ctx);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      await finishStepRun(stepRunId, "succeeded", output, 1);
      previousOutput = output;
    } catch (err: any) {
      await finishStepRun(stepRunId, "failed", null, 2, String(err?.message ?? err));
      await updateWorkflowRun(workflowRunId, { status: "failed", finished_at: new Date().toISOString() });
      return "failed";
    }
  }

  await updateWorkflowRun(workflowRunId, { status: "succeeded", finished_at: new Date().toISOString() });
  await incrementOrgUsage(run.org_id, Math.max(1, llmOrHttpCallsMade));
  return "succeeded";
}

export type { WorkflowStep };
