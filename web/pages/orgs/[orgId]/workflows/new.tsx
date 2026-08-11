import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation } from "@apollo/client";
import { useUserId } from "@nhost/react";
import { ORG_WORKFLOWS, CREATE_WORKFLOW } from "@/lib/gql";
import { roleHeader, OrgRole } from "@/lib/role";
import StepEditor, { StepDraft } from "@/components/StepEditor";
import TriggerEditor, { TriggerDraft } from "@/components/TriggerEditor";

export default function NewWorkflowPage() {
  const router = useRouter();
  const orgId = router.query.orgId as string;
  const userId = useUserId();
  const { data } = useQuery(ORG_WORKFLOWS, { variables: { orgId }, skip: !orgId, ...roleHeader("viewer") });
  const myRole: OrgRole | undefined = data?.org_members.find((m: any) => m.user_id === userId)?.role;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [triggers, setTriggers] = useState<TriggerDraft[]>([]);
  const [createWorkflow, { loading, error }] = useMutation(CREATE_WORKFLOW);

  if (myRole === "viewer") {
    return (
      <div className="container">
        <p>Viewers can't create workflows.</p>
      </div>
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
    <div className="container">
      <Link href={`/orgs/${orgId}`}>← back</Link>
      <h1>New workflow</h1>
      <form onSubmit={submit}>
        <div className="card">
          <input placeholder="Workflow name" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%", marginBottom: 8 }} />
          <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ width: "100%" }} />
        </div>

        <h3>Steps</h3>
        <StepEditor steps={steps} onChange={setSteps} isOwner={myRole === "owner"} />

        <h3>Triggers</h3>
        <TriggerEditor triggers={triggers} onChange={setTriggers} isOwner={myRole === "owner"} />

        <div style={{ marginTop: 16 }}>
          <button className="primary" type="submit" disabled={loading || !name}>
            Create workflow
          </button>
          {error ? <p style={{ color: "#f87171" }}>{error.message}</p> : null}
        </div>
      </form>
    </div>
  );
}
