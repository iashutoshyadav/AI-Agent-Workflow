import { useState } from "react";

export interface StepDraft {
  id?: string;
  position: number;
  type: string;
  name: string;
  config: string; // JSON text, kept as a string while editing
}

const STEP_TYPES = ["llm_call", "http_request", "db_write", "notify", "conditional_branch", "approval_gate"];

// db_write and notify are owner-only per the assignment's Layer 2
// rule. This greys them out as a UX nicety — the REAL enforcement is
// server-side (see workflow_steps insert/update permissions in
// nhost/metadata), so a viewer poking at devtools still can't sneak
// one through.
const OWNER_ONLY_TYPES = new Set(["db_write", "notify"]);

export default function StepEditor({
  steps,
  onChange,
  isOwner,
}: {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  isOwner: boolean;
}) {
  function update(i: number, patch: Partial<StepDraft>) {
    const next = steps.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = steps.slice();
    [next[i], next[j]] = [next[j], next[i]];
    next.forEach((s, idx) => (s.position = idx));
    onChange(next);
  }

  function remove(i: number) {
    const next = steps.filter((_, idx) => idx !== i);
    next.forEach((s, idx) => (s.position = idx));
    onChange(next);
  }

  function add() {
    onChange([
      ...steps,
      { position: steps.length, type: "llm_call", name: `Step ${steps.length + 1}`, config: "{}" },
    ]);
  }

  return (
    <div>
      {steps.map((step, i) => {
        const locked = OWNER_ONLY_TYPES.has(step.type) && !isOwner;
        return (
          <div className="card" key={step.id ?? i}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                <span className="badge">{i + 1}</span>
                <input value={step.name} onChange={(e) => update(i, { name: e.target.value })} disabled={locked} />
                <select value={step.type} onChange={(e) => update(i, { type: e.target.value })} disabled={locked}>
                  {STEP_TYPES.map((t) => (
                    <option key={t} value={t} disabled={OWNER_ONLY_TYPES.has(t) && !isOwner}>
                      {t}
                      {OWNER_ONLY_TYPES.has(t) ? " (owner only)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row">
                <button onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === steps.length - 1}>↓</button>
                <button className="danger" onClick={() => remove(i)} disabled={locked}>
                  ✕
                </button>
              </div>
            </div>
            <ConfigHint type={step.type} />
            <textarea
              value={step.config}
              onChange={(e) => update(i, { config: e.target.value })}
              rows={4}
              style={{ width: "100%", marginTop: 8, fontFamily: "monospace" }}
              disabled={locked}
            />
          </div>
        );
      })}
      <button onClick={add}>+ Add step</button>
    </div>
  );
}

function ConfigHint({ type }: { type: string }) {
  const hints: Record<string, string> = {
    llm_call: '{"prompt": "Summarize: {{output}}", "system_prompt": "..."}',
    http_request: '{"url": "https://api.example.com/x", "method": "GET"}',
    db_write: '{"data": {"field": "{{output.text}}"}}',
    notify: '{"slack_webhook_url": "https://hooks.slack.com/...", "message": "Run finished"}',
    conditional_branch:
      '{"field": "output.text", "operator": "contains", "value": "urgent", "on_true": {"action":"continue"}, "on_false": {"action":"skip_to","position": 3}}',
    approval_gate: "{}",
  };
  return <div style={{ fontSize: 12, color: "#a1a1aa" }}>config example: {hints[type]}</div>;
}
