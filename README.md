# AI Agent Workflow Builder

A mini n8n for chaining AI agent steps, built on nhost (Postgres + Hasura + Auth + Functions) and a Next.js frontend.

Status: schema, Hasura permissions (both layers), Action handlers (engine + approval + all four trigger types), and the frontend are implemented against nhost's documented conventions but have **not yet been run against a live nhost project** — see "What's verified vs. not" below before you demo this.

## Architecture

```
Next.js (web/) --GraphQL--> Hasura --Actions/Events/Cron--> nhost Functions (functions/) --admin GraphQL--> Postgres
                                                                    |
                                                      real LLM API / external HTTP APIs / Slack
```

- **`nhost/migrations/default/1000000000000_init/`** — the full Postgres schema (SQL).
- **`nhost/metadata/`** — Hasura relationships, Layer 1 (org+role) permissions, Actions, Event Triggers, Cron Trigger.
- **`functions/`** — the Action handlers and trigger runners (TypeScript, nhost Functions / Node).
- **`web/`** — the Next.js frontend.
- **`docs/writeup.md`** — the ~1 page design write-up (schema reasoning, both permission layers, approval-gate pause/resume).
- **`docs/demo-scenario.md`** — a runnable checklist for the Final Task live walkthrough.

## Setup (you're new to nhost/Hasura — read this first)

1. **Create an nhost project.** Go to https://nhost.io → sign up (free) → New Project. Note the project's **subdomain** and **region** (shown on the project's dashboard) — you'll need these.
2. **Apply the schema.** Easiest path for a first-timer: open the project's Hasura Console (button on the nhost dashboard) → **Data → SQL** tab → paste the contents of `nhost/migrations/default/1000000000000_init/up.sql` → Run.
   - (Alternative, once comfortable with the CLI: `nhost init` in an empty folder to get a CLI-version-correct `nhost.toml`, copy `nhost/migrations` and `nhost/metadata` in, then `nhost up` / `hasura metadata apply`.)
3. **Import Hasura metadata.** Hasura Console → **Settings → Metadata → Import metadata**, or use `hasura metadata apply` with the CLI against `nhost/metadata/`. This wires up relationships, permissions, the three Actions, the two Event Triggers, and the Cron Trigger.
   - The Action/Event/Cron webhook URLs use the placeholder `{{NHOST_FUNCTIONS_URL}}` — after you deploy `functions/`, replace this with your project's actual functions base URL (shown on the dashboard, looks like `https://<subdomain>.functions.<region>.nhost.run/v1`), either by editing the YAML before import or via the Console UI per-action/trigger.
4. **Deploy the functions.** `functions/` follows nhost's convention (one file = one endpoint). Push this repo to GitHub and connect it as the project's Git repo in the nhost dashboard (Settings → Git), or use `nhost deploy` with the CLI. Set these **environment variables / secrets** in the nhost dashboard (Settings → Environment Variables):
   - `LLM_API_KEY` — a free-tier key from [Groq](https://console.groq.com) or [OpenRouter](https://openrouter.ai) (OpenAI-compatible chat completions API). Leave unset to run `llm_call` as a disclosed stub (1.2s artificial delay, clearly labeled `stubbed: true` in the output).
   - `LLM_BASE_URL` (default `https://api.groq.com/openai/v1/chat/completions`), `LLM_MODEL` (default `llama-3.1-8b-instant`) — adjust if using OpenRouter/Gemini instead.
   - `NHOST_GRAPHQL_URL`, `NHOST_ADMIN_SECRET` — usually auto-injected by nhost into function environments; set manually only if running functions elsewhere.
5. **Wire up allowed roles.** The schema includes a trigger (`sync_auth_user_role`, in the migration) that grants a user the Hasura role `owner`/`editor`/`viewer` the moment they're added to `org_members` with that role, by writing to `auth.user_roles`. Verify this table/column names match your nhost auth schema version (Console → Data → auth schema) — if it doesn't exist, grant roles manually via Console → Settings → Users, or ask in nhost's Discord for the current table name.
6. **Deploy the frontend.** `cd web && npm install`. Set in `web/.env.local` (and as Vercel project env vars):
   ```
   NEXT_PUBLIC_NHOST_SUBDOMAIN=<your subdomain>
   NEXT_PUBLIC_NHOST_REGION=<your region>
   ```
   Then `npm run dev` locally, or deploy `web/` to Vercel (root directory = `web`).

## Running it locally end-to-end

1. Sign up two users in the app (`/auth`) — these will be your two orgs' owners.
2. As user A: `/orgs` → Create organization → build a workflow with steps + a trigger → Run.
3. Give user B's user ID (shown on their `/orgs` page) to user A only if you want them in the SAME org — for the cross-org isolation check, instead sign up user B fresh and have them create their OWN org (Org B), so Org A and Org B share no members.
4. Watch `/orgs/<org>/runs/<run>` update live via the GraphQL subscription, including the `paused` state on an `approval_gate` step.

## Trigger types — how each one is actually invoked

- **Manual** — the Run button, calling the `triggerWorkflowRun` Action.
- **Webhook** — `POST <functions-url>/webhook-trigger` with `{"workflow_id": "...", "token": "<the trigger's config.secret>"}`. Only an owner can create a `webhook` trigger row (see permissions), and the secret is set by them at creation.
- **Scheduled** — a Hasura Cron Trigger ticks every 5 minutes and calls `<functions-url>/scheduled-runner`, which checks each active `scheduled` trigger's own `config.cron` expression.
- **Database event** — `INSERT` a row into `external_events` (org_id, source, payload) — this fires the `external_event_insert` Hasura Event Trigger, which starts any matching `event`-type trigger in that org.

See `docs/demo-scenario.md` for exact commands.

## What's verified vs. not

Built and internally consistent, but not yet exercised against a live Hasura instance (no nhost account existed when this was written):
- Exact Hasura metadata YAML syntax (table/action/event-trigger shape) for the specific Hasura version your project provisions.
- The `auth.user_roles` table/column names (nhost auth schema has changed across versions — see step 5 above).
- npm package versions in `package.json` / `web/package.json` resolving cleanly (`npm install` will surface any that need bumping).

Everything else — the schema, the permission logic, the engine, the retry/quota logic — was designed and written directly against Hasura's and nhost's documented behavior; run `npm install` and a metadata import to surface anything that needs a small syntax fix.
