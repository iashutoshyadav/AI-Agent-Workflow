import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation } from "@apollo/client";
import { useUserId } from "@nhost/react";
import {
  ORG_WORKFLOWS,
  WORKFLOW_RUNS,
  UPDATE_WORKFLOW,
  INSERT_STEP,
  UPDATE_STEP,
  DELETE_STEP,
  INSERT_TRIGGER,
  UPDATE_TRIGGER,
  DELETE_TRIGGER,
  TRIGGER_WORKFLOW_RUN,
} from "@/lib/gql";
import { roleHeader, OrgRole } from "@/lib/role";
import StepEditor, { StepDraft } from "@/components/StepEditor";
import TriggerEditor, { TriggerDraft } from "@/components/TriggerEditor";
import TopNav from "@/components/TopNav";

export default function WorkflowPage() {
  const router = useRouter();
  const orgId = router.query.orgId as string;
  const workflowId = router.query.workflowId as string;
  const userId = useUserId();

  const { data, refetch } = useQuery(ORG_WORKFLOWS, { variables: { orgId }, skip: !orgId, ...roleHeader("user") });
  const { data: runsData, refetch: refetchRuns } = useQuery(WORKFLOW_RUNS, {
    variables: { workflowId },
    skip: !workflowId,
    pollInterval: 10000,
    ...roleHeader("user"),
  });

  const myRole: OrgRole | undefined = data?.org_members.find((m: any) => m.user_id === userId)?.role;
  const workflow = data?.workflows.find((w: any) => w.id === workflowId);
  const orgName = data?.organizations_by_pk?.name;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [triggers, setTriggers] = useState<TriggerDraft[]>([]);

  useEffect(() => {
    if (!workflow) return;
    setName(workflow.name);
    setDescription(workflow.description ?? "");
    setSteps(workflow.workflow_steps.map((s: any) => ({ id: s.id, position: s.position, type: s.type, name: s.name, config: JSON.stringify(s.config) })));
    setTriggers(workflow.workflow_triggers.map((t: any) => ({ id: t.id, type: t.type, config: JSON.stringify(t.config), is_active: t.is_active })));
  }, [workflow?.id]);

  const [updateWorkflow] = useMutation(UPDATE_WORKFLOW);
  const [insertStep] = useMutation(INSERT_STEP);
  const [updateStep] = useMutation(UPDATE_STEP);
  const [deleteStep] = useMutation(DELETE_STEP);
  const [insertTrigger] = useMutation(INSERT_TRIGGER);
  const [updateTrigger] = useMutation(UPDATE_TRIGGER);
  const [deleteTrigger] = useMutation(DELETE_TRIGGER);
  const [triggerRun, { loading: triggering }] = useMutation(TRIGGER_WORKFLOW_RUN);
  const [saving, setSaving] = useState(false);

  if (!workflow) {
    return (
      <>
        <TopNav crumbs={orgName ? [{ label: orgName, href: `/orgs/${orgId}` }] : undefined} />
        <div className="container">
          <p className="muted">Loading…</p>
        </div>
      </>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const rh = roleHeader(myRole);
      await updateWorkflow({ variables: { id: workflowId, set: { name, description } }, ...rh });

      const originalStepIds = new Set(workflow.workflow_steps.map((s: any) => s.id));
      const keptStepIds = new Set(steps.filter((s) => s.id).map((s) => s.id));
      for (const s of workflow.workflow_steps) {
        if (!keptStepIds.has(s.id)) await deleteStep({ variables: { id: s.id }, ...rh });
      }
      for (const s of steps) {
        const config = JSON.parse(s.config || "{}");
        if (s.id && originalStepIds.has(s.id)) {
          await updateStep({ variables: { id: s.id, set: { position: s.position, type: s.type, name: s.name, config } }, ...rh });
        } else {
          await insertStep({ variables: { object: { workflow_id: workflowId, position: s.position, type: s.type, name: s.name, config } }, ...rh });
        }
      }

      const originalTriggerIds = new Set(workflow.workflow_triggers.map((t: any) => t.id));
      const keptTriggerIds = new Set(triggers.filter((t) => t.id).map((t) => t.id));
      for (const t of workflow.workflow_triggers) {
        if (!keptTriggerIds.has(t.id)) await deleteTrigger({ variables: { id: t.id }, ...rh });
      }
      for (const t of triggers) {
        const config = JSON.parse(t.config || "{}");
        if (t.id && originalTriggerIds.has(t.id)) {
          await updateTrigger({ variables: { id: t.id, set: { config, is_active: t.is_active } }, ...rh });
        } else {
          await insertTrigger({ variables: { object: { workflow_id: workflowId, type: t.type, config, is_active: t.is_active } }, ...rh });
        }
      }

      await refetch();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    try {
      const res = await triggerRun({ variables: { workflowId }, ...roleHeader(myRole) });
      const runId = res.data?.triggerWorkflowRun?.workflow_run_id;
      if (runId) router.push(`/orgs/${orgId}/runs/${runId}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      refetchRuns();
    }
  }

  return (
    <>
      <TopNav crumbs={[{ label: orgName ?? "…", href: `/orgs/${orgId}` }, { label: workflow.name }]} />
      <div className="container">
        <Link href={`/orgs/${orgId}`}>← back</Link>
        <div className="row between" style={{ marginTop: 8 }}>
          <h1>{workflow.name}</h1>
          {myRole !== "viewer" ? (
            <button className="primary" onClick={runNow} disabled={triggering}>
              {triggering ? "Running…" : "▶ Run"}
            </button>
          ) : null}
        </div>

        {myRole !== "viewer" ? (
          <>
            <div className="card">
              <label className="field">
                <span className="field-label">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="field-label">Description</span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ width: "100%" }} />
              </label>
            </div>

            <div className="section-header">
              <h2 style={{ margin: 0 }}>Steps</h2>
            </div>
            <StepEditor steps={steps} onChange={setSteps} isOwner={myRole === "owner"} />

            <div className="section-header">
              <h2 style={{ margin: 0 }}>Triggers</h2>
            </div>
            <TriggerEditor triggers={triggers} onChange={setTriggers} isOwner={myRole === "owner"} />

            <button className="primary" onClick={save} disabled={saving} style={{ marginTop: 16 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        ) : (
          <div className="card">
            {steps.map((s) => (
              <div key={s.id} className="muted" style={{ padding: "4px 0" }}>
                {s.position + 1}. {s.name} <span className="faint">({s.type})</span>
              </div>
            ))}
          </div>
        )}

        <div className="section-header">
          <h2 style={{ margin: 0 }}>Run history</h2>
        </div>
        {(runsData?.workflow_runs ?? []).length === 0 ? (
          <div className="empty-state">No runs yet.</div>
        ) : (
          (runsData?.workflow_runs ?? []).map((r: any) => (
            <div className="card row between" key={r.id}>
              <Link href={`/orgs/${orgId}/runs/${r.id}`}>
                {new Date(r.created_at).toLocaleString()} <span className="faint">· {r.trigger_type}</span>
              </Link>
              <span className={`badge ${r.status}`}>{r.status}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
