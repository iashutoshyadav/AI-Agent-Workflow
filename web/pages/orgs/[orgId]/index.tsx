import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation } from "@apollo/client";
import { useUserId } from "@nhost/react";
import { ORG_WORKFLOWS, TRIGGER_WORKFLOW_RUN, INSERT_ORG_MEMBER, DELETE_ORG_MEMBER } from "@/lib/gql";
import { roleHeader, OrgRole } from "@/lib/role";
import TopNav from "@/components/TopNav";

export default function OrgPage() {
  const router = useRouter();
  const orgId = router.query.orgId as string;
  const userId = useUserId();

  const { data, loading, error, refetch } = useQuery(ORG_WORKFLOWS, {
    variables: { orgId },
    skip: !orgId,
    pollInterval: 15000,
    ...roleHeader("user"),
  });

  const myRole: OrgRole | undefined = data?.org_members.find((m: any) => m.user_id === userId)?.role;

  const [triggerRun, { loading: triggering }] = useMutation(TRIGGER_WORKFLOW_RUN);
  const [addMember, { loading: addingMember }] = useMutation(INSERT_ORG_MEMBER);
  const [removeMember] = useMutation(DELETE_ORG_MEMBER);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<OrgRole>("viewer");

  if (loading) {
    return (
      <>
        <TopNav />
        <div className="container">
          <p className="muted">Loading…</p>
        </div>
      </>
    );
  }
  if (error) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="error-box">{error.message}</div>
        </div>
      </>
    );
  }
  if (!data?.organizations_by_pk) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="empty-state">
            Org not found, or you're not a member of it.
            <div style={{ marginTop: 12 }}>
              <Link href="/orgs">← all orgs</Link>
            </div>
          </div>
        </div>
      </>
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
    <>
      <TopNav crumbs={[{ label: org.name }]} />
      <div className="container">
        <Link href="/orgs">← all orgs</Link>
        <div className="row between" style={{ marginTop: 8 }}>
          <h1>
            {org.name} <span className="badge role">{myRole}</span>
          </h1>
          {myRole !== "viewer" ? (
            <Link href={`/orgs/${orgId}/workflows/new`}>
              <button className="primary">+ New workflow</button>
            </Link>
          ) : null}
        </div>

        <div className="card">
          <strong>Usage this period</strong>
          <div className="muted" style={{ marginTop: 6 }}>
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

        <div className="section-header">
          <h2 style={{ margin: 0 }}>Workflows</h2>
        </div>

        {(data.workflows ?? []).length === 0 ? (
          <div className="empty-state">
            No workflows yet.
            {myRole !== "viewer" ? (
              <>
                {" "}
                <Link href={`/orgs/${orgId}/workflows/new`}>Create your first one →</Link>
              </>
            ) : null}
          </div>
        ) : null}

        {(data.workflows ?? []).map((wf: any) => {
          const lastRun = wf.workflow_runs[0];
          return (
            <div className="card" key={wf.id}>
              <div className="row between">
                <div className="row">
                  <Link href={`/orgs/${orgId}/workflows/${wf.id}`}>
                    <strong>{wf.name}</strong>
                  </Link>
                  {lastRun ? <span className={`badge ${lastRun.status}`}>{lastRun.status}</span> : null}
                </div>
                {myRole !== "viewer" ? (
                  <button className="primary small" onClick={() => runNow(wf.id)} disabled={triggering}>
                    {triggering ? "Running…" : "Run"}
                  </button>
                ) : null}
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                {wf.workflow_steps.length} steps ({wf.workflow_steps.map((s: any) => s.type).join(", ")}) ·{" "}
                {wf.workflow_triggers.length ? wf.workflow_triggers.map((t: any) => t.type).join(", ") : "no trigger"}
              </div>
            </div>
          );
        })}

        {myRole === "owner" ? (
          <>
            <div className="section-header">
              <h2 style={{ margin: 0 }}>Members</h2>
            </div>
            <div className="card">
              {data.org_members.map((m: any) => (
                <div className="row between" key={m.id} style={{ marginBottom: 8 }}>
                  <span className="row">
                    <code>{m.user_id}</code>
                    <span className="badge role">{m.role}</span>
                  </span>
                  {m.user_id !== userId ? (
                    <button
                      className="danger small"
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
              <form onSubmit={handleAddMember} className="row" style={{ marginTop: 14 }}>
                <input
                  placeholder="user id (uuid)"
                  value={memberUserId}
                  onChange={(e) => setMemberUserId(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as OrgRole)}>
                  <option value="owner">owner</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
                <button className="primary" type="submit" disabled={addingMember || !memberUserId.trim()}>
                  Add
                </button>
              </form>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
