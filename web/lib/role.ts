// Every query/mutation that touches org-scoped tables must set
// X-Hasura-Role to the caller's role in the org being acted on — a
// user can be owner in one org and viewer in another, and Hasura picks
// which permission ruleset to evaluate from this header. This is only
// ever a hint about which ruleset to try: every insert/update
// permission's `check`/`filter` and every Action handler independently
// re-derives the real role from org_members, so a wrong or stale value
// here fails closed (rejected), never open. See docs/writeup.md.
export function roleHeader(role: string | undefined | null) {
  return { context: { headers: { "x-hasura-role": role ?? "viewer" } } };
}

export type OrgRole = "owner" | "editor" | "viewer";
