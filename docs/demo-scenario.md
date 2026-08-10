# Final Task — live demo checklist

Maps directly to the assignment's six requirements. Run through this
once before recording, to catch anything environment-specific.

## 0. Setup
- Deploy per `README.md`. Have `<app-url>` (Vercel) and `<functions-url>` (nhost) handy.
- Sign up **User A** at `<app-url>/auth`. Create **Org A** (`/orgs` → Create organization). User A is now Org A's owner.
- Sign up **User B** at `<app-url>/auth`. Create **Org B**. User B is now Org B's owner — Org A and Org B share zero members.

## 1. Two orgs, own users and roles
- Already true from setup. Optionally: as User A (owner), add a third user as `editor` in Org A via the Members panel, to show role variety.

## 2. Org A owner builds a 3+ step workflow (llm_call, http_request, conditional_branch)
In Org A → New workflow, add steps in order:
1. `llm_call` — config: `{"prompt": "Classify this ticket as urgent or normal: 'My payment failed twice.'", "system_prompt": "Reply with exactly one word: urgent or normal."}`
2. `http_request` — config: `{"url": "https://httpbin.org/get", "method": "GET"}` (any public API works)
3. `conditional_branch` — config: `{"field": "text", "operator": "contains", "value": "urgent", "on_true": {"action":"continue"}, "on_false": {"action":"skip_to","position": 4}}`
4. `approval_gate` — name it "Manager sign-off"
5. `notify` — config: `{"message": "Workflow finished", "slack_webhook_url": "<optional real Slack incoming webhook>"}`

Add a trigger: `manual` (always available) **and** one of `webhook`/`scheduled`/`event` for step 3.

## 3. Started two ways
- **Manual**: click Run on the workflow page.
- **Webhook**: add a `webhook` trigger with `{"secret": "demo-token-123"}`, then:
  ```bash
  curl -X POST <functions-url>/webhook-trigger \
    -H "content-type: application/json" \
    -d '{"workflow_id": "<workflow-id>", "token": "demo-token-123"}'
  ```
- **Event**: add an `event` trigger with `{"source": "orders"}`, then insert a row into `external_events` for Org A's `org_id` with `source: "orders"` (via Hasura Console → Data, or a GraphQL mutation as an org member) — this fires the Event Trigger automatically.

## 4. Approval gate pauses; only owner/editor in that org can approve
- Open the run page (`/orgs/<orgA>/runs/<runId>`) as User A — watch it reach `paused` on the approval_gate step with no refresh.
- Click **Approve** — the run resumes live to `succeeded` (or shows the `notify` step's delivery).

## 5. Live status streams step-by-step, no refresh
- This is the run page throughout steps 3–4 — it's a GraphQL subscription (`STEP_RUNS_SUBSCRIPTION`), not polling. Narrate that explicitly while it updates.

## 6. Org B cannot see/trigger/approve Org A's data — including by guessing IDs
- Copy Org A's `workflow_id` and the paused `step_run_id` from the browser URL / GraphQL responses while logged in as User A.
- Log out, log in as **User B** (Org B).
- Try navigating directly to `/orgs/<orgA-id>` and `/orgs/<orgA-id>/runs/<runId>` — both render "not found / not a member" (the Hasura `select` permission filter returns zero rows; the frontend just has nothing to show).
- Optionally, from the browser devtools console while logged in as User B, run the raw GraphQL query/mutation against Org A's IDs directly (bypassing the UI entirely) to show it's a server-side guarantee, not a UI guard:
  ```graphql
  mutation { triggerWorkflowRun(workflow_id: "<org-A-workflow-id>") { status } }
  mutation { approveStep(step_run_id: "<org-A-step-run-id>", approve: true) { status } }
  ```
  Both return a 403/error from the Action handler's `getRealRole` check (User B has no `org_members` row for Org A at all).
