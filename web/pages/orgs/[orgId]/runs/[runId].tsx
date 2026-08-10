import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation, useSubscription } from "@apollo/client";
import { useUserId } from "@nhost/react";
import { ORG_WORKFLOWS, STEP_RUNS_SUBSCRIPTION, APPROVE_STEP } from "@/lib/gql";
import { roleHeader, OrgRole } from "@/lib/role";

// Live, subscription-driven view of one workflow_run — this is what
// makes the "no refresh, including the paused state" part of the
// final scenario real: STEP_RUNS_SUBSCRIPTION is a GraphQL
// subscription (websocket), not a poll.
export default function RunPage() {
  const router = useRouter();
  const orgId = router.query.orgId as string;
  const runId = router.query.runId as string;
  const userId = useUserId();

  const { data: orgData } = useQuery(ORG_WORKFLOWS, { variables: { orgId }, skip: !orgId });
  const myRole: OrgRole | undefined = orgData?.org_members.find((m: any) => m.user_id === userId)?.role;

  const { data, loading, error } = useSubscription(STEP_RUNS_SUBSCRIPTION, {
    variables: { runId },
    skip: !runId,
  });

  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);
  const [reason, setReason] = useState("");

  if (loading && !data) return <div className="container">Connecting…</div>;
  if (error) return <div className="container" style={{ color: "#f87171" }}>{error.message}</div>;

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
    <div className="container">
      <Link href={`/orgs/${orgId}`}>← back</Link>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Run</h1>
        {run ? <span className={`badge ${run.status}`} style={{ fontSize: 16 }}>{run.status}</span> : null}
      </div>

      {stepRuns.map((sr: any) => (
        <div className="card" key={sr.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>
              {sr.workflow_step.position + 1}. {sr.workflow_step.name} ({sr.workflow_step.type})
            </strong>
            <span className={`badge ${sr.status}`}>{sr.status}</span>
          </div>

          {sr.status === "paused" && sr.workflow_step.type === "approval_gate" ? (
            myRole === "owner" || myRole === "editor" ? (
              <div style={{ marginTop: 10 }}>
                <p style={{ color: "#fbbf24" }}>Paused — awaiting approval.</p>
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
              <p style={{ color: "#fbbf24" }}>Paused — awaiting approval from an owner or editor.</p>
            )
          ) : null}

          {sr.output ? (
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 12, color: "#a1a1aa" }}>
              {JSON.stringify(sr.output, null, 2)}
            </pre>
          ) : null}
          {sr.error ? <p style={{ color: "#f87171" }}>{sr.error}</p> : null}
        </div>
      ))}
    </div>
  );
}
