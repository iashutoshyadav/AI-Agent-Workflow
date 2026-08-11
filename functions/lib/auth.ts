import { adminGql } from "./hasura";

export type OrgRole = "owner" | "editor" | "viewer";

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function getRealRole(
  userId: string,
  orgId: string
): Promise<OrgRole | null> {
  const data = await adminGql<{ org_members: { role: OrgRole }[] }>(
    `query GetRole($orgId: uuid!, $userId: uuid!) {
      org_members(where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }) {
        role
      }
    }`,
    { orgId, userId }
  );
  return data.org_members[0]?.role ?? null;
}

export function requireRole(role: OrgRole | null, allowed: OrgRole[]): void {
  if (!role || !allowed.includes(role)) {
    throw new HttpError(
      403,
      `Forbidden: role '${role ?? "none"}' is not one of [${allowed.join(", ")}] for this org`
    );
  }
}

export function getSessionUserId(sessionVariables: Record<string, string> | undefined): string {
  const userId = sessionVariables?.["x-hasura-user-id"];
  if (!userId) throw new HttpError(401, "Unauthenticated: missing x-hasura-user-id");
  return userId;
}
