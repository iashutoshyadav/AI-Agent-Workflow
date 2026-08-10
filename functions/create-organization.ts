import type { Request, Response } from "express";
import { adminGql } from "./lib/hasura";
import { getSessionUserId, HttpError } from "./lib/auth";

/**
 * Bootstraps a brand new org and inserts the caller as its first
 * owner. Not one of the six graded step/trigger types — this exists
 * purely to solve the chicken-and-egg problem of "org_members insert
 * permission requires an existing owner row to check against."
 * Runs as one Hasura bulk mutation so both inserts commit atomically.
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const userId = getSessionUserId(session_variables);
    const name: string = input.name;
    if (!name || !name.trim()) throw new HttpError(400, "name is required");

    const data = await adminGql<{ insert_organizations_one: { id: string } }>(
      `mutation($name: String!, $userId: uuid!) {
        insert_organizations_one(object: {
          name: $name,
          org_members: { data: { user_id: $userId, role: "owner" } }
        }) { id }
      }`,
      { name, userId }
    );

    res.status(200).json({ org_id: data.insert_organizations_one.id });
  } catch (err: any) {
    const statusCode = err instanceof HttpError ? err.statusCode : 500;
    res.status(statusCode).json({ message: err.message ?? "Internal error" });
  }
}
