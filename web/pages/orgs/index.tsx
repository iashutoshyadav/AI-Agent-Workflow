import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation } from "@apollo/client";
import { useUserId, useAuthenticationStatus, useSignOut } from "@nhost/react";
import { MY_ORGS, CREATE_ORGANIZATION } from "@/lib/gql";

export default function OrgsPage() {
  const router = useRouter();
  const userId = useUserId();
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const { signOut } = useSignOut();
  const { data, loading, error, refetch } = useQuery(MY_ORGS, { skip: !isAuthenticated });
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

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Your organizations</h1>
        <button onClick={() => signOut()}>Sign out</button>
      </div>

      <p style={{ fontSize: 13, color: "#a1a1aa" }}>
        Your user ID (share with an org owner so they can add you as a member): <code>{userId}</code>
      </p>

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: "#f87171" }}>{error.message}</p> : null}

      {(data?.organizations ?? []).map((org: any) => (
        <div className="card" key={org.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{org.name}</strong>{" "}
              <span className="badge">{myRoleByOrg.get(org.id) ?? "member"}</span>
            </div>
            <Link href={`/orgs/${org.id}`}>Open →</Link>
          </div>
          <div style={{ fontSize: 13, color: "#a1a1aa", marginTop: 6 }}>
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

      <div className="card">
        <h3>Create a new organization</h3>
        <p style={{ fontSize: 13, color: "#a1a1aa" }}>You become its first owner.</p>
        <form onSubmit={handleCreate} className="row">
          <input placeholder="Org name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="primary" type="submit" disabled={creating}>
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
