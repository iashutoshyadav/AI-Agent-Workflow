drop view if exists public.org_usage_stats;

drop trigger if exists trg_workflows_updated_at on public.workflows;
drop trigger if exists trg_step_runs_org_id on public.step_runs;
drop trigger if exists trg_workflow_runs_org_id on public.workflow_runs;
drop trigger if exists trg_workflow_triggers_org_id on public.workflow_triggers;
drop trigger if exists trg_workflow_steps_org_id on public.workflow_steps;

drop function if exists public.touch_updated_at();
drop function if exists public.set_org_id_from_workflow_run();
drop function if exists public.set_org_id_from_workflow();

drop table if exists public.external_events;
drop table if exists public.workflow_artifacts;
drop table if exists public.step_runs;
drop table if exists public.workflow_runs;
drop table if exists public.workflow_triggers;
drop table if exists public.workflow_steps;
drop table if exists public.workflows;
drop table if exists public.org_members;
drop table if exists public.organizations;
