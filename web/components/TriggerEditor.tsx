export interface TriggerDraft {
  id?: string;
  type: string;
  config: string;
  is_active: boolean;
}

const TRIGGER_TYPES = ["manual", "webhook", "scheduled", "event"];

// webhook is owner-only per the assignment's Layer 2 rule — greyed
// out here as UX only; enforced server-side by the
// workflow_triggers insert permission.
export default function TriggerEditor({
  triggers,
  onChange,
  isOwner,
}: {
  triggers: TriggerDraft[];
  onChange: (t: TriggerDraft[]) => void;
  isOwner: boolean;
}) {
  function update(i: number, patch: Partial<TriggerDraft>) {
    const next = triggers.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function remove(i: number) {
    onChange(triggers.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...triggers, { type: "manual", config: "{}", is_active: true }]);
  }

  return (
    <div>
      {triggers.map((t, i) => {
        const locked = t.type === "webhook" && !isOwner;
        return (
          <div className="card" key={t.id ?? i}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <select value={t.type} onChange={(e) => update(i, { type: e.target.value })} disabled={locked}>
                {TRIGGER_TYPES.map((tt) => (
                  <option key={tt} value={tt} disabled={tt === "webhook" && !isOwner}>
                    {tt}
                    {tt === "webhook" ? " (owner only)" : ""}
                  </option>
                ))}
              </select>
              <button className="danger" onClick={() => remove(i)} disabled={locked}>
                ✕
              </button>
            </div>
            <TriggerHint type={t.type} />
            <textarea
              value={t.config}
              onChange={(e) => update(i, { config: e.target.value })}
              rows={3}
              style={{ width: "100%", marginTop: 8, fontFamily: "monospace" }}
              disabled={locked}
            />
          </div>
        );
      })}
      <button onClick={add}>+ Add trigger</button>
    </div>
  );
}

function TriggerHint({ type }: { type: string }) {
  const hints: Record<string, string> = {
    manual: "{} — started from the Run button",
    webhook: '{"secret": "choose-a-long-random-token"} — POST {workflow_id, token} to /webhook-trigger',
    scheduled: '{"cron": "*/10 * * * *"} — standard 5-field cron',
    event: '{"source": "orders"} — matches external_events.source, or "*" for any',
  };
  return <div style={{ fontSize: 12, color: "#a1a1aa" }}>{hints[type]}</div>;
}
