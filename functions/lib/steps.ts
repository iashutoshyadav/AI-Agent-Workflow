import { adminGql } from "./hasura";
import { interpolate, interpolateDeep, getPath } from "./interpolate";
import { withRetry } from "./retry";

export interface StepContext {
  orgId: string;
  workflowRunId: string;
  stepRunId: string;
  previousOutput: unknown;
}

// ------------------------------------------------------------------
// llm_call — real call to an OpenAI-compatible chat completions API.
// Groq and OpenRouter both speak this exact schema on their free
// tiers, so one implementation covers either — just point LLM_BASE_URL
// / LLM_MODEL at whichever you signed up for. Falls back to a clearly
// labeled stub (with a disclosed artificial delay) when LLM_API_KEY
// isn't set, matching the assignment's stated fallback.
// ------------------------------------------------------------------
export async function runLlmCall(config: any, ctx: StepContext) {
  const apiKey = process.env.LLM_API_KEY;
  const prompt = interpolate(config.prompt ?? "", ctx.previousOutput);

  if (!apiKey) {
    await new Promise((r) => setTimeout(r, 1200));
    return {
      stubbed: true,
      note: "LLM_API_KEY not set — stubbed response with a disclosed 1.2s artificial delay.",
      prompt,
      text: config.stub_response ?? "This is a stubbed LLM response.",
    };
  }

  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1/chat/completions";
  const model = config.model ?? process.env.LLM_MODEL ?? "llama-3.1-8b-instant";

  const { result } = await withRetry(async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: config.temperature ?? 0.7,
        messages: [
          ...(config.system_prompt ? [{ role: "system", content: config.system_prompt }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM API error ${res.status}: ${await res.text()}`);
    const json: any = await res.json();
    const text: string = json.choices?.[0]?.message?.content ?? "";
    return { stubbed: false, prompt, text, raw: json };
  }, 1);

  return result;
}

// ------------------------------------------------------------------
// http_request — generic call to any external API, one retry.
// ------------------------------------------------------------------
export async function runHttpRequest(config: any, ctx: StepContext) {
  if (!config.url) throw new Error("http_request step is missing config.url");

  const { result } = await withRetry(async () => {
    const res = await fetch(config.url, {
      method: config.method ?? "GET",
      headers: (interpolateDeep(config.headers ?? {}, ctx.previousOutput) as Record<string, string>),
      body: config.body ? JSON.stringify(interpolateDeep(config.body, ctx.previousOutput)) : undefined,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* not json, keep as text */
    }
    if (!res.ok) throw new Error(`http_request step got HTTP ${res.status}: ${text}`);
    return { status: res.status, body };
  }, 1);

  return result;
}

// ------------------------------------------------------------------
// db_write — persists a result into workflow_artifacts (our own table).
// ------------------------------------------------------------------
export async function runDbWrite(config: any, ctx: StepContext) {
  const data = interpolateDeep(config.data ?? ctx.previousOutput ?? {}, ctx.previousOutput);
  await adminGql(
    `mutation SaveArtifact($orgId: uuid!, $runId: uuid!, $stepRunId: uuid!, $data: jsonb!) {
      insert_workflow_artifacts_one(object: {
        org_id: $orgId, workflow_run_id: $runId, step_run_id: $stepRunId, data: $data
      }) { id }
    }`,
    { orgId: ctx.orgId, runId: ctx.workflowRunId, stepRunId: ctx.stepRunId, data }
  );
  return { saved: true, data };
}

// ------------------------------------------------------------------
// conditional_branch — if/else on the PREVIOUS step's output.
// config: { field, operator: eq|neq|contains|gt|lt|truthy, value,
//           on_true: {action:"continue"} | {action:"skip_to", position},
//           on_false: {action:"continue"} | {action:"skip_to", position} }
// ------------------------------------------------------------------
export function evaluateCondition(config: any, previousOutput: unknown): boolean {
  const actual = getPath(previousOutput, config.field ?? "");
  const expected = config.value;
  switch (config.operator ?? "eq") {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      return typeof actual === "string" && actual.includes(String(expected));
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "truthy":
      return Boolean(actual);
    default:
      return Boolean(actual);
  }
}
