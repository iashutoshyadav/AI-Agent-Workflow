create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  quota_calls_allowed integer not null default 1000,
  quota_calls_used    integer not null default 0,
  quota_period_start  date not null default date_trunc('month', now())::date,
  created_at          timestamptz not null default now()
);

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

create table if not exists public.external_events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  source     text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_external_events_org_id on public.external_events(org_id);

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

insert into auth.roles (role) values ('owner'), ('editor'), ('viewer')
  on conflict (role) do nothing;

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

create or replace trigger trg_org_members_sync_role_update
  after update of role on public.org_members
  for each row execute function public.sync_auth_user_role();

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
