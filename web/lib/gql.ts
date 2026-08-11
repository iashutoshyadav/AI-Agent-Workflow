import { gql } from "@apollo/client";

export const MY_ORGS = gql`
  query MyOrgs {
    organizations {
      id
      name
      quota_calls_used
      quota_calls_allowed
    }
    org_members {
      id
      org_id
      user_id
      role
    }
  }
`;

export const ORG_WORKFLOWS = gql`
  query OrgWorkflows($orgId: uuid!) {
    organizations_by_pk(id: $orgId) {
      id
      name
      quota_calls_used
      quota_calls_allowed
      usage_stats {
        runs_this_month
        avg_run_duration_seconds
      }
    }
    org_members(where: { org_id: { _eq: $orgId } }) {
      id
      user_id
      role
    }
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
      id
      name
      description
      created_at
      workflow_steps(order_by: { position: asc }) {
        id
        position
        type
        name
        config
      }
      workflow_triggers {
        id
        type
        config
        is_active
      }
      workflow_runs(order_by: { created_at: desc }, limit: 1) {
        id
        status
        trigger_type
        created_at
        started_at
        finished_at
      }
    }
  }
`;

export const WORKFLOW_RUNS = gql`
  query WorkflowRuns($workflowId: uuid!) {
    workflow_runs(where: { workflow_id: { _eq: $workflowId } }, order_by: { created_at: desc }, limit: 20) {
      id
      status
      trigger_type
      created_at
      started_at
      finished_at
    }
  }
`;

export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($object: workflows_insert_input!) {
    insert_workflows_one(object: $object) {
      id
    }
  }
`;

export const UPDATE_WORKFLOW = gql`
  mutation UpdateWorkflow($id: uuid!, $set: workflows_set_input!) {
    update_workflows_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
    }
  }
`;

export const INSERT_STEP = gql`
  mutation InsertStep($object: workflow_steps_insert_input!) {
    insert_workflow_steps_one(object: $object) {
      id
    }
  }
`;

export const UPDATE_STEP = gql`
  mutation UpdateStep($id: uuid!, $set: workflow_steps_set_input!) {
    update_workflow_steps_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
    }
  }
`;

export const DELETE_STEP = gql`
  mutation DeleteStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) {
      id
    }
  }
`;

export const INSERT_TRIGGER = gql`
  mutation InsertTrigger($object: workflow_triggers_insert_input!) {
    insert_workflow_triggers_one(object: $object) {
      id
    }
  }
`;

export const UPDATE_TRIGGER = gql`
  mutation UpdateTrigger($id: uuid!, $set: workflow_triggers_set_input!) {
    update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
    }
  }
`;

export const DELETE_TRIGGER = gql`
  mutation DeleteTrigger($id: uuid!) {
    delete_workflow_triggers_by_pk(id: $id) {
      id
    }
  }
`;

export const INSERT_ORG_MEMBER = gql`
  mutation InsertOrgMember($orgId: uuid!, $userId: uuid!, $role: String!) {
    insert_org_members_one(object: { org_id: $orgId, user_id: $userId, role: $role }) {
      id
    }
  }
`;

export const DELETE_ORG_MEMBER = gql`
  mutation DeleteOrgMember($id: uuid!) {
    delete_org_members_by_pk(id: $id) {
      id
    }
  }
`;

export const CREATE_ORGANIZATION = gql`
  mutation CreateOrganization($name: String!) {
    createOrganization(name: $name) {
      org_id
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(workflow_id: $workflowId) {
      workflow_run_id
      status
    }
  }
`;

export const APPROVE_STEP = gql`
  mutation ApproveStep($stepRunId: uuid!, $approve: Boolean!, $reason: String) {
    approveStep(step_run_id: $stepRunId, approve: $approve, reason: $reason) {
      step_run_id
      workflow_run_id
      status
    }
  }
`;

export const STEP_RUNS_SUBSCRIPTION = gql`
  subscription StepRunsForRun($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      started_at
      finished_at
    }
    step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { created_at: asc }) {
      id
      status
      output
      error
      attempt_count
      approved_by
      approved_at
      started_at
      finished_at
      workflow_step {
        id
        position
        type
        name
      }
    }
  }
`;
