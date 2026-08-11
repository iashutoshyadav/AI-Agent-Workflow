export function roleHeader(role: string | undefined | null) {
  return { context: { headers: { "x-hasura-role": role ?? "user" } } };
}

export type OrgRole = "owner" | "editor" | "viewer";
