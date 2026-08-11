import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation } from "@apollo/client";
import { useUserId } from "@nhost/react";
import { ORG_WORKFLOWS, CREATE_WORKFLOW } from "@/lib/gql";
import { roleHeader, OrgRole } from "@/lib/role";
import StepEditor, { StepDraft } from "@/components/StepEditor";
import TriggerEditor, { TriggerDraft } from "@/components/TriggerEditor";
import TopNav from "@/components/TopNav";

export default function NewWorkflowPage() {
  const router = useRouter();
  const orgId = router.query.orgId as string;
  const userId = useUserId();
  const { data } = useQuery(ORG_WORKFLOWS, { variables: { orgId }, skip: !orgId, ...roleHeader("user") });
  const myRole: OrgRole | undefined = data?.org_members.find((m: any) => m.user_id === userId)?.role;
  const orgName = data?.organizations_by_pk?.name;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [triggers, setTriggers] = useState<TriggerDraft[]>([]);
  const [createWorkflow, { loading, error }] = useMutation(CREATE_WORKFLOW);

  if (myRole === "viewer") {
    return (
      <>
        <TopNav crumbs={orgName ? [{ label: orgName, href: `/orgs/${orgId}` }] : undefined} />
        <div className="container">
          <div className="empty-state">Viewers can't create workflows.</div>
        </div>
      </>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const object = {
        org_id: orgId,
        name,
        description,
        workflow_steps: {
          data: steps.map((s) => ({ position: s.position, type: s.type, name: s.name, config: JSON.parse(s.config || "{}") })),
        },
        workflow_triggers: {
          data: triggers.map((t) => ({ type: t.type, config: JSON.parse(t.config || "{}"), is_active: t.is_active })),
        },
      };
      const res = await createWorkflow({ variables: { object }, ...roleHeader(myRole) });
      const id = res.data?.insert_workflows_one?.id;
      if (id) router.push(`/orgs/${orgId}/workflows/${id}`);
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <>
      <TopNav crumbs={[{ label: orgName ?? "…", href: `/orgs/${orgId}` }, { label: "New workflow" }]} />
      <div className="container">
        <Link href={`/orgs/${orgId}`}>← back</Link>
        <h1 style={{ marginTop: 8 }}>New workflow</h1>
        <form onSubmit={submit}>
          <div className="card">
            <label className="field">
              <span className="field-label">Name</span>
              <input placeholder="e.g. Support Ticket Triage" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-label">Description</span>
              <textarea
                placeholder="What does this workflow do?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                style={{ width: "100%" }}
              />
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

          <div style={{ marginTop: 20 }}>
            <button className="primary" type="submit" disabled={loading || !name}>
              {loading ? "Creating…" : "Create workflow"}
            </button>
            {error ? <div className="error-box">{error.message}</div> : null}
          </div>
        </form>
      </div>
    </>
  );
}
