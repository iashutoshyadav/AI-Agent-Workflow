import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation } from "@apollo/client";
import { useUserId } from "@nhost/react";
import { ORG_WORKFLOWS, TRIGGER_WORKFLOW_RUN, INSERT_ORG_MEMBER, DELETE_ORG_MEMBER } from "@/lib/gql";
import { roleHeader, OrgRole } from "@/lib/role";

export default function OrgPage() {
  const router = useRouter();
  const orgId = router.query.orgId as string;
  const userId = useUserId();

  const { data, loading, error, refetch } = useQuery(ORG_WORKFLOWS, {
    variables: { orgId },
    skip: !orgId,
    pollInterval: 15000,
  });

  const myRole: OrgRole | undefined = data?.org_members.find((m: any) => m.user_id === userId)?.role;

  const [triggerRun, { loading: triggering }] = useMutation(TRIGGER_WORKFLOW_RUN);
  const [addMember, { loading: addingMember }] = useMutation(INSERT_ORG_MEMBER);
  const [removeMember] = useMutation(DELETE_ORG_MEMBER);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<OrgRole>("viewer");

  if (loading) return <div className="container">Loading…</div>;
  if (error) return <div className="container" style={{ color: "#f87171" }}>{error.message}</div>;
  if (!data?.organizations_by_pk) {
    return (
      <div className="container">
        <p>Org not found, or you're not a member of it.</p>
        <Link href="/orgs">← back</Link>
      </div>
    );
  }

  const org = data.organizations_by_pk;

  async function runNow(workflowId: string) {
    try {
      const res = await triggerRun({ variables: { workflowId }, ...roleHeader(myRole) });
      const runId = res.data?.triggerWorkflowRun?.workflow_run_id;
      if (runId) router.push(`/orgs/${orgId}/runs/${runId}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      refetch();
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!memberUserId.trim()) return;
    try {
      await addMember({
        variables: { orgId, userId: memberUserId.trim(), role: memberRole },
        ...roleHeader(myRole),
      });
      setMemberUserId("");
      refetch();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="container">
      <Link href="/orgs">← all orgs</Link>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>
          {org.name} <span className="badge">{myRole}</span>
        </h1>
        {myRole !== "viewer" ? <Link href={`/orgs/${orgId}/workflows/new`}><button className="primary">+ New workflow</button></Link> : null}
      </div>

      <div className="card">
        <strong>Usage this period</strong>
        <div style={{ fontSize: 13, color: "#a1a1aa", marginTop: 6 }}>
          {org.quota_calls_used} / {org.quota_calls_allowed} calls used
          {org.usage_stats ? (
            <>
              {" · "}
              {org.usage_stats.runs_this_month} runs this month
              {org.usage_stats.avg_run_duration_seconds != null
                ? ` · avg run ${Math.round(org.usage_stats.avg_run_duration_seconds)}s`
                : ""}
            </>
          ) : null}
        </div>
        <div className="quota-bar">
          <div
            className="quota-bar-fill"
            style={{ width: `${Math.min(100, (org.quota_calls_used / Math.max(1, org.quota_calls_allowed)) * 100)}%` }}
          />
        </div>
      </div>

      <h2>Workflows</h2>
      {(data.workflows ?? []).map((wf: any) => {
        const lastRun = wf.workflow_runs[0];
        return (
          <div className="card" key={wf.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <Link href={`/orgs/${orgId}/workflows/${wf.id}`}>
                  <strong>{wf.name}</strong>
                </Link>
                {lastRun ? <span className={`badge ${lastRun.status}`} style={{ marginLeft: 8 }}>{lastRun.status}</span> : null}
              </div>
              {myRole !== "viewer" ? (
                <button className="primary" onClick={() => runNow(wf.id)} disabled={triggering}>
                  Run
                </button>
              ) : null}
            </div>
            <div style={{ fontSize: 13, color: "#a1a1aa", marginTop: 6 }}>
              {wf.workflow_steps.length} steps ({wf.workflow_steps.map((s: any) => s.type).join(", ")}) ·{" "}
              {wf.workflow_triggers.length ? wf.workflow_triggers.map((t: any) => t.type).join(", ") : "no trigger"}
            </div>
          </div>
        );
      })}

      {myRole === "owner" ? (
        <div className="card">
          <h3>Members</h3>
          {data.org_members.map((m: any) => (
            <div className="row" key={m.id} style={{ justifyContent: "space-between", marginBottom: 4 }}>
              <span>
                <code>{m.user_id}</code> — {m.role}
              </span>
              {m.user_id !== userId ? (
                <button
                  className="danger"
                  onClick={async () => {
                    await removeMember({ variables: { id: m.id }, ...roleHeader(myRole) });
                    refetch();
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <form onSubmit={handleAddMember} className="row" style={{ marginTop: 10 }}>
            <input placeholder="user id (uuid)" value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} style={{ flex: 1 }} />
            <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as OrgRole)}>
              <option value="owner">owner</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button className="primary" type="submit" disabled={addingMember}>
              Add
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
