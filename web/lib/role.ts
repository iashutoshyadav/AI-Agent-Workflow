// Every query/mutation that touches org-scoped tables must set
// X-Hasura-Role to the caller's role in the org being acted on — a
// user can be owner in one org and viewer in another, and Hasura picks
// which permission ruleset to evaluate from this header. This is only
// ever a hint about which ruleset to try: every insert/update
// permission's `check`/`filter` and every Action handler independently
// re-derives the real role from org_members, so a wrong or stale value
// here fails closed (rejected), never open. See docs/writeup.md.
// "user" — never "viewer" — is the safe fallback: every session's JWT
// always has "user" in x-hasura-allowed-roles (nhost's default role
// for a fresh signup), whereas "viewer"/"editor"/"owner" only get
// added once sync_auth_user_role fires on their first org_members
// insert. A brand-new user with zero orgs would get "Your requested
// role is not in allowed roles" if we defaulted to viewer (found via
// live testing). organizations/org_members etc. all grant identical
// read access to "user" as to viewer, so this loses nothing.
export function roleHeader(role: string | undefined | null) {
  return { context: { headers: { "x-hasura-role": role ?? "user" } } };
}

export type OrgRole = "owner" | "editor" | "viewer";
