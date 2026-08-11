// Thin admin GraphQL client shared by every function. Using the admin
// secret here is intentional and safe: these functions are never
// reachable except via a Hasura Action / Event Trigger / Cron Trigger
// (all configured with the admin secret as an outgoing header from
// Hasura's side) or, for the webhook trigger, after we've manually
// validated a per-trigger secret token. Regular users never call these
// URLs directly, and always go through Hasura's own role-scoped
// GraphQL API for everything else.

// nhost's Run/Functions environment doesn't inject a ready-made
// NHOST_GRAPHQL_URL — only NHOST_SUBDOMAIN + NHOST_REGION (plus
// NHOST_ADMIN_SECRET, which IS injected directly). Build the URL from
// those so this doesn't depend on a variable that isn't actually set.
const GRAPHQL_URL =
  process.env.NHOST_GRAPHQL_URL ||
  process.env.HASURA_GRAPHQL_URL ||
  (process.env.NHOST_SUBDOMAIN && process.env.NHOST_REGION
    ? `https://${process.env.NHOST_SUBDOMAIN}.graphql.${process.env.NHOST_REGION}.nhost.run/v1`
    : "");
const ADMIN_SECRET =
  process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || "";

export class GraphQLError extends Error {
  errors: unknown;
  constructor(message: string, errors: unknown) {
    super(message);
    this.errors = errors;
  }
}

export async function adminGql<T = any>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  if (!GRAPHQL_URL || !ADMIN_SECRET) {
    throw new Error(
      "NHOST_GRAPHQL_URL / NHOST_ADMIN_SECRET are not set in the function's environment"
    );
  }

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hasura-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json: any = await res.json();
  if (json.errors) {
    throw new GraphQLError("Hasura admin GraphQL request failed", json.errors);
  }
  return json.data as T;
}
