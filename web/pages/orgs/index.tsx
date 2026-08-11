import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation } from "@apollo/client";
import { useUserId, useAuthenticationStatus } from "@nhost/react";
import { MY_ORGS, CREATE_ORGANIZATION } from "@/lib/gql";
import { roleHeader } from "@/lib/role";
import TopNav from "@/components/TopNav";

export default function OrgsPage() {
  const router = useRouter();
  const userId = useUserId();
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const { data, loading, error, refetch } = useQuery(MY_ORGS, {
    skip: !isAuthenticated,
    ...roleHeader("user"),
  });
  const [createOrg, { loading: creating }] = useMutation(CREATE_ORGANIZATION);
  const [newName, setNewName] = useState("");

  if (!authLoading && !isAuthenticated) {
    router.replace("/auth");
    return null;
  }

  const myRoleByOrg = new Map<string, string>();
  for (const m of data?.org_members ?? []) {
    if (m.user_id === userId) myRoleByOrg.set(m.org_id, m.role);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createOrg({ variables: { name: newName.trim() } });
    setNewName("");
    refetch();
  }

  const orgs = data?.organizations ?? [];

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Your organizations</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Your user ID (share with an org owner so they can add you as a member): <code>{userId}</code>
        </p>

        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <div className="error-box">{error.message}</div> : null}

        {!loading && orgs.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 20 }}>
            You're not in any organization yet. Create one below to get started.
          </div>
        ) : null}

        {orgs.map((org: any) => (
          <div className="card" key={org.id}>
            <div className="row between">
              <div className="row">
                <strong>{org.name}</strong>
                <span className="badge role">{myRoleByOrg.get(org.id) ?? "member"}</span>
              </div>
              <Link href={`/orgs/${org.id}`}>Open →</Link>
            </div>
            <div className="muted" style={{ marginTop: 10 }}>
              Quota: {org.quota_calls_used} / {org.quota_calls_allowed} calls used this period
            </div>
            <div className="quota-bar">
              <div
                className="quota-bar-fill"
                style={{ width: `${Math.min(100, (org.quota_calls_used / Math.max(1, org.quota_calls_allowed)) * 100)}%` }}
              />
            </div>
          </div>
        ))}

        <div className="section-header">
          <h3 style={{ margin: 0 }}>Create a new organization</h3>
        </div>
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            You become its first owner.
          </p>
          <form onSubmit={handleCreate} className="row">
            <input placeholder="Org name, e.g. Acme Inc" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
            <button className="primary" type="submit" disabled={creating || !newName.trim()}>
              {creating ? "Creating…" : "Create"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
