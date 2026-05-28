import { z } from "zod";

const Target = z.object({
  environment: z.enum(["dev", "staging", "prod"]),
  ga4_property_id: z.string().optional(),
  web_stream_id: z.string().optional(),
  measurement_id: z.string().optional(),
  gtm_account_id: z.string().optional(),
  gtm_web_container_id: z.string().optional(),
  gtm_server_container_id: z.string().optional(),
}).strict();

const SourceArtifacts = z.object({
  design_plan: z.string().optional(),
  setup_runbook: z.string().optional(),
  analytics_contract: z.string().optional(),
}).strict().optional();

const Execution = z.object({
  mode: z.enum(["dry_run", "apply_workspace"]),
  workspace_name: z.string(),
  publish_allowed: z.boolean().default(false),
  require_human_approval: z.boolean().default(true),
  approval_token_required: z.boolean().default(true),
  destructive_changes_allowed: z.boolean().default(false),
  create_container_version_allowed: z.boolean().default(false),
  note: z.string().optional(),
}).strict();

const Preflight = z.object({
  required: z.array(z.string()),
}).strict().optional();

const CustomDimension = z.object({
  display_name: z.string(),
  parameter_name: z.string(),
  scope: z.enum(["EVENT", "USER", "ITEM"]),
  description: z.string().optional(),
  decision: z.string().optional(),
  source_catalog_row: z.string().optional(),
}).strict();

const CustomMetric = z.object({
  display_name: z.string(),
  parameter_name: z.string(),
  scope: z.enum(["EVENT"]),
  unit: z.enum([
    "STANDARD", "CURRENCY", "FEET", "METERS", "KILOMETERS", "MILES",
    "MILLISECONDS", "SECONDS", "MINUTES", "HOURS",
  ]),
  description: z.string().optional(),
  decision: z.string().optional(),
  source_catalog_row: z.string().optional(),
}).strict();

const KeyEvent = z.object({
  event_name: z.string(),
  decision: z.string().optional(),
}).strict();

const MeasurementProtocol = z.object({
  enabled: z.boolean().default(false),
  api_secret: z.object({
    action: z.enum([
      "manual_create",
      "mcp_create_placeholder",
      "manual_create_or_mcp_create_placeholder",
    ]),
    secret_value: z.literal("NEVER_STORE_SECRET_IN_SPEC"),
    handling_note: z.string().optional(),
  }).strict().optional(),
}).strict().optional();

const GA4Admin = z.object({
  custom_dimensions: z.array(CustomDimension).default([]),
  custom_metrics: z.array(CustomMetric).default([]),
  key_events: z.array(KeyEvent).default([]),
  measurement_protocol: MeasurementProtocol,
}).strict();

const DLV = z.object({
  name: z.string(),
  data_layer_variable_name: z.string(),
  version: z.literal(1).or(z.literal(2)).default(2),
  purpose: z.string().optional(),
}).strict();

const TriggerFilter = z.object({
  variable: z.string(),
  operator: z.enum(["equals", "contains", "starts_with", "ends_with", "matches_regex"]),
  value: z.string(),
}).strict();

const Trigger = z.object({
  name: z.string(),
  type: z.enum(["custom_event", "page_view", "history_change"]),
  event_name: z.string().optional(),
  filters: z.array(TriggerFilter).default([]),
}).strict();

// Tag.type is kept as a free string so disallowed types (e.g. "consent_initialization",
// any UA-era type) parse successfully and are caught by the semantic validator with the
// right error code, instead of failing at schema level with a generic SPEC_INVALID.
const Tag = z.object({
  name: z.string(),
  type: z.string(),
  measurement_id: z.string().optional(),
  event_name: z.string(),
  trigger: z.string(),
  params: z.record(z.string(), z.string()).default({}),
}).strict();

const Ecommerce = z.object({
  enabled: z.boolean().default(false),
  trigger: z.string().optional(),
  allowed_event_names: z.array(z.string()).default([]),
  note: z.string().optional(),
}).strict().optional();

const GTMWeb = z.object({
  enabled: z.boolean(),
  built_in_variables: z.array(z.string()).default([]),
  data_layer_variables: z.array(DLV).default([]),
  triggers: z.array(Trigger).default([]),
  tags: z.array(Tag).default([]),
  ecommerce: Ecommerce,
}).strict();

const SGTM = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().optional(),
  container_id: z.string().optional(),
  clients: z.array(z.unknown()).default([]),
  tags: z.array(z.unknown()).default([]),
  transformations: z.array(z.unknown()).default([]),
  note: z.string().optional(),
}).strict().optional();

const Validation = z.object({
  forbidden_keys: z.object({
    exact: z.array(z.string()).default([]),
    contains: z.array(z.string()).default([]),
    patterns: z.array(z.string()).default([]),
  }).strict().optional(),
  required_checks: z.array(z.string()).default([]),
  publish_gate: z.record(z.string(), z.unknown()).optional(),
  destructive_change_guard: z.record(z.string(), z.unknown()).optional(),
  pii_guard: z.record(z.string(), z.unknown()).optional(),
  consent_change_guard: z.record(z.string(), z.unknown()).optional(),
}).strict().optional();

export const McpExecutionSpec = z.object({
  status: z.string(),
  type: z.literal("ga4_gtm_mcp_execution_spec"),
  version: z.literal(1),
  target: Target,
  source_artifacts: SourceArtifacts,
  execution: Execution,
  preflight: Preflight,
  ga4_admin: GA4Admin,
  gtm_web: GTMWeb,
  sgtm: SGTM,
  validation: Validation,
}).strict();

export type McpExecutionSpec = z.infer<typeof McpExecutionSpec>;
