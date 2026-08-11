-- AI Agent Workflow Builder — initial schema
-- Design notes (see docs/writeup.md for full reasoning):
--  * org_id is denormalized onto every child table (steps, triggers, runs,
--    step_runs) and is populated ONLY by a BEFORE INSERT trigger from the
--    parent row — never accepted from client input. This lets every Hasura
--    permission be a single flat org_members lookup instead of a deep
--    relationship chain, which is both easier to get right and cheaper to
--    evaluate on every request.
--  * Roles/statuses are plain text + CHECK constraints (not native enums)
--    so Hasura's generated GraphQL enums stay simple and permission
--    expressions can use plain _in filters.

create extension if not exists pgcrypto;

-- ============================================================
-- organizations
-- ============================================================
create table if not exists public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  quota_calls_allowed integer not null default 1000,
  quota_calls_used    integer not null default 0,
  quota_period_start  date not null default date_trunc('month', now())::date,
  created_at          timestamptz not null default now()
);

-- ============================================================
-- org_members — user_id, org_id, role
-- ============================================================
create table if not exists public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists idx_org_members_user_id on public.org_members(user_id);
create index if not exists idx_org_members_org_id on public.org_members(org_id);

-- ============================================================
-- workflows
-- ============================================================
create table if not exists public.workflows (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  description text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_workflows_org_id on public.workflows(org_id);

-- ============================================================
-- workflow_steps — ordered, typed, JSONB config
-- ============================================================
create table if not exists public.workflow_steps (
  id          uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  position    integer not null,
  type        text not null check (type in (
                'llm_call','http_request','db_write','notify',
                'conditional_branch','approval_gate'
              )),
  name        text not null,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (workflow_id, position)
);

create index if not exists idx_workflow_steps_workflow_id on public.workflow_steps(workflow_id);
create index if not exists idx_workflow_steps_org_id on public.workflow_steps(org_id);

-- ============================================================
-- workflow_triggers
-- ============================================================
create table if not exists public.workflow_triggers (
  id          uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  type        text not null check (type in ('manual','webhook','scheduled','event')),
  config      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_workflow_triggers_workflow_id on public.workflow_triggers(workflow_id);
create index if not exists idx_workflow_triggers_org_id on public.workflow_triggers(org_id);

-- ============================================================
-- workflow_runs — one per execution
-- ============================================================
create table if not exists public.workflow_runs (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.workflows(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  status       text not null check (status in (
                 'pending','running','paused','succeeded','failed','cancelled'
               )) default 'pending',
  trigger_type text not null check (trigger_type in ('manual','webhook','scheduled','event')),
  triggered_by uuid references auth.users(id),
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_workflow_runs_workflow_id on public.workflow_runs(workflow_id);
create index if not exists idx_workflow_runs_org_id on public.workflow_runs(org_id);
create index if not exists idx_workflow_runs_status on public.workflow_runs(status);

-- ============================================================
-- step_runs — one per step per run
-- ============================================================
create table if not exists public.step_runs (
  id               uuid primary key default gen_random_uuid(),
  workflow_run_id  uuid not null references public.workflow_runs(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id) on delete cascade,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  status           text not null check (status in (
                     'pending','running','succeeded','failed','paused','skipped'
                   )) default 'pending',
  input            jsonb,
  output           jsonb,
  error            text,
  attempt_count    integer not null default 0,
  approved_by      uuid references auth.users(id),
  approved_at      timestamptz,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_step_runs_workflow_run_id on public.step_runs(workflow_run_id);
create index if not exists idx_step_runs_org_id on public.step_runs(org_id);

-- ============================================================
-- workflow_artifacts — where a `db_write` step actually persists its
-- result ("saves a result into your own tables"), separate from
-- step_runs.output so it's clearly a first-class, queryable artifact.
-- ============================================================
create table if not exists public.workflow_artifacts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_run_id     uuid not null references public.step_runs(id) on delete cascade,
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_workflow_artifacts_org_id on public.workflow_artifacts(org_id);
create index if not exists idx_workflow_artifacts_run_id on public.workflow_artifacts(workflow_run_id);

-- ============================================================
-- external_events — the "watched table" for the Database Event
-- trigger type. An external integration (or a test script) inserts a
-- row here; a Hasura Event Trigger on INSERT calls the run-starting
-- function, which matches it against active workflow_triggers of
-- type 'event' by org_id + source and starts a run.
-- ============================================================
create table if not exists public.external_events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  source     text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_external_events_org_id on public.external_events(org_id);

-- ============================================================
-- org_id auto-population triggers
-- (org_id is never writable by clients — see Hasura insert permission
--  column lists — it is always derived server-side from the parent row)
-- ============================================================

create or replace function public.set_org_id_from_workflow()
returns trigger as $$
begin
  select org_id into new.org_id from public.workflows where id = new.workflow_id;
  return new;
end;
$$ language plpgsql;

create or replace trigger trg_workflow_steps_org_id
  before insert on public.workflow_steps
  for each row execute function public.set_org_id_from_workflow();

create or replace trigger trg_workflow_triggers_org_id
  before insert on public.workflow_triggers
  for each row execute function public.set_org_id_from_workflow();

create or replace trigger trg_workflow_runs_org_id
  before insert on public.workflow_runs
  for each row execute function public.set_org_id_from_workflow();

create or replace function public.set_org_id_from_workflow_run()
returns trigger as $$
begin
  select org_id into new.org_id from public.workflow_runs where id = new.workflow_run_id;
  return new;
end;
$$ language plpgsql;

create or replace trigger trg_step_runs_org_id
  before insert on public.step_runs
  for each row execute function public.set_org_id_from_workflow_run();

-- Keep Hasura Auth's allowed-roles in sync with org membership, so a
-- user who is e.g. owner in one org and viewer in another has BOTH
-- roles available to select via the X-Hasura-Role header. This is
-- safe to be "generous" with because every insert/update permission
-- and every Action handler re-derives the caller's REAL role for the
-- SPECIFIC org being touched from org_members using x-hasura-user-id
-- (verified by the JWT) — the X-Hasura-Role header is only ever used
-- to pick which permission ruleset to attempt, never trusted as the
-- authorization decision itself. See docs/writeup.md.
--
-- NOTE: this assumes nhost's default `auth.user_roles(user_id, role)`
-- table with a unique (user_id, role) constraint. Verify this against
-- your project's auth schema version — if it differs, grant roles via
-- the nhost dashboard instead (Settings → Roles / user's allowed
-- roles) and drop this trigger.
create or replace function public.sync_auth_user_role()
returns trigger as $$
begin
  insert into auth.user_roles (user_id, role)
  values (new.user_id, new.role)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger trg_org_members_sync_role
  after insert on public.org_members
  for each row execute function public.sync_auth_user_role();

-- updated_at bookkeeping
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger trg_workflows_updated_at
  before update on public.workflows
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Aggregation view — org-level usage this month + avg run duration
-- Tracked in Hasura and exposed via an object relationship on
-- `organizations` (see metadata) so the frontend can query
-- `organization { usage_stats { runs_this_month avg_run_duration_seconds } }`
-- ============================================================
create or replace view public.org_usage_stats as
select
  o.id as org_id,
  o.quota_calls_used,
  o.quota_calls_allowed,
  count(wr.id) filter (
    where wr.created_at >= date_trunc('month', now())
  ) as runs_this_month,
  avg(extract(epoch from (wr.finished_at - wr.started_at))) filter (
    where wr.finished_at is not null
  ) as avg_run_duration_seconds
from public.organizations o
left join public.workflow_runs wr on wr.org_id = o.id
group by o.id, o.quota_calls_used, o.quota_calls_allowed;
