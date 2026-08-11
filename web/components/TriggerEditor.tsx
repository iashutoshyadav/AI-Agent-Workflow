export interface TriggerDraft {
  id?: string;
  type: string;
  config: string;
  is_active: boolean;
}

const TRIGGER_TYPES = ["manual", "webhook", "scheduled", "event"];

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
      {triggers.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: 16 }}>
          No triggers yet — the workflow can still be run manually from its page.
        </div>
      ) : null}
      {triggers.map((t, i) => {
        const locked = t.type === "webhook" && !isOwner;
        return (
          <div className="card" key={t.id ?? i}>
            <div className="row between">
              <select value={t.type} onChange={(e) => update(i, { type: e.target.value })} disabled={locked}>
                {TRIGGER_TYPES.map((tt) => (
                  <option key={tt} value={tt} disabled={tt === "webhook" && !isOwner}>
                    {tt}
                    {tt === "webhook" ? " (owner only)" : ""}
                  </option>
                ))}
              </select>
              <button className="danger small" onClick={() => remove(i)} disabled={locked}>
                Remove
              </button>
            </div>
            <TriggerHint type={t.type} />
            <textarea
              value={t.config}
              onChange={(e) => update(i, { config: e.target.value })}
              rows={3}
              style={{ width: "100%", marginTop: 8, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
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
  return (
    <div className="faint" style={{ marginTop: 10 }}>
      <code style={{ fontSize: 11 }}>{hints[type]}</code>
    </div>
  );
}
