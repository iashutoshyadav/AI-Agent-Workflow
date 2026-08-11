import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation, useSubscription } from "@apollo/client";
import { useUserId } from "@nhost/react";
import { ORG_WORKFLOWS, WORKFLOW_RUN_SUBSCRIPTION, STEP_RUNS_SUBSCRIPTION, APPROVE_STEP } from "@/lib/gql";
import { roleHeader, OrgRole } from "@/lib/role";
import TopNav from "@/components/TopNav";

export default function RunPage() {
  const router = useRouter();
  const orgId = router.query.orgId as string;
  const runId = router.query.runId as string;
  const userId = useUserId();

  const { data: orgData } = useQuery(ORG_WORKFLOWS, { variables: { orgId }, skip: !orgId, ...roleHeader("user") });
  const myRole: OrgRole | undefined = orgData?.org_members.find((m: any) => m.user_id === userId)?.role;
  const orgName = orgData?.organizations_by_pk?.name;

  const { data: runData, loading: runLoading, error: runError } = useSubscription(WORKFLOW_RUN_SUBSCRIPTION, {
    variables: { runId },
    skip: !runId,
    ...roleHeader("user"),
  });
  const { data: stepData, loading: stepsLoading, error: stepsError } = useSubscription(STEP_RUNS_SUBSCRIPTION, {
    variables: { runId },
    skip: !runId,
    ...roleHeader("user"),
  });

  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);
  const [reason, setReason] = useState("");

  const loading = runLoading || stepsLoading;
  const error = runError || stepsError;
  const data = runData || stepData ? { ...runData, ...stepData } : undefined;

  if (loading && !data) {
    return (
      <>
        <TopNav crumbs={orgName ? [{ label: orgName, href: `/orgs/${orgId}` }] : undefined} />
        <div className="container">
          <p className="muted">Connecting…</p>
        </div>
      </>
    );
  }
  if (error) {
    return (
      <>
        <TopNav crumbs={orgName ? [{ label: orgName, href: `/orgs/${orgId}` }] : undefined} />
        <div className="container">
          <div className="error-box">{error.message}</div>
        </div>
      </>
    );
  }

  const run = data?.workflow_runs_by_pk;
  const stepRuns = data?.step_runs ?? [];

  async function decide(stepRunId: string, approve: boolean) {
    try {
      await approveStep({ variables: { stepRunId, approve, reason: reason || null }, ...roleHeader(myRole) });
      setReason("");
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <>
      <TopNav crumbs={[{ label: orgName ?? "…", href: `/orgs/${orgId}` }, { label: "Run" }]} />
      <div className="container">
        <Link href={`/orgs/${orgId}`}>← back</Link>
        <div className="row between" style={{ marginTop: 8 }}>
          <h1>Run</h1>
          {run ? <span className={`badge ${run.status}`} style={{ fontSize: 13 }}>{run.status}</span> : null}
        </div>
        <p className="faint" style={{ marginTop: -4 }}>Live — updates automatically, no refresh needed.</p>

        {stepRuns.map((sr: any) => (
          <div className="card" key={sr.id}>
            <div className="row between">
              <strong>
                {sr.workflow_step.position + 1}. {sr.workflow_step.name} <span className="faint">({sr.workflow_step.type})</span>
              </strong>
              <span className={`badge ${sr.status}`}>{sr.status}</span>
            </div>

            {sr.status === "paused" && sr.workflow_step.type === "approval_gate" ? (
              myRole === "owner" || myRole === "editor" ? (
                <div style={{ marginTop: 12 }}>
                  <p style={{ color: "var(--warning)", fontWeight: 600, margin: "0 0 8px" }}>Paused — awaiting approval.</p>
                  <input
                    placeholder="reason (optional, used if rejecting)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                  <div className="row">
                    <button className="primary" disabled={approving} onClick={() => decide(sr.id, true)}>
                      Approve
                    </button>
                    <button className="danger" disabled={approving} onClick={() => decide(sr.id, false)}>
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ color: "var(--warning)", fontWeight: 600, marginTop: 12 }}>Paused — awaiting approval from an owner or editor.</p>
              )
            ) : null}

            {sr.output ? (
              <pre
                style={{
                  marginTop: 10,
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  background: "var(--surface-alt)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 10,
                  maxHeight: 240,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(sr.output, null, 2)}
              </pre>
            ) : null}
            {sr.error ? <div className="error-box" style={{ marginTop: 10 }}>{sr.error}</div> : null}
          </div>
        ))}
      </div>
    </>
  );
}
