const GRAPHQL_URL =
  process.env.NHOST_GRAPHQL_URL?.trim() ||
  process.env.HASURA_GRAPHQL_URL?.trim() ||
  (process.env.NHOST_SUBDOMAIN && process.env.NHOST_REGION
    ? `https://${process.env.NHOST_SUBDOMAIN.trim()}.graphql.${process.env.NHOST_REGION.trim()}.nhost.run/v1`
    : "");
const ADMIN_SECRET =
  process.env.NHOST_ADMIN_SECRET?.trim() || process.env.HASURA_GRAPHQL_ADMIN_SECRET?.trim() || "";

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
