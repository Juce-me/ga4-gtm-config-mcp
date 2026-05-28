import { McpExecutionSpec } from "./mcpExecutionSpec.schema.js";

export function summarizeSpec(spec: McpExecutionSpec): string {
  const lines: string[] = [
    "ga4-gtm-config-mcp spec summary",
    `target.environment: ${spec.target.environment}`,
    `target.ga4_property_id: ${spec.target.ga4_property_id ?? "(unset)"}`,
    `target.gtm_account_id: ${spec.target.gtm_account_id ?? "(unset)"}`,
    `target.gtm_web_container_id: ${spec.target.gtm_web_container_id ?? "(unset)"}`,
    `execution.mode: ${spec.execution.mode}`,
    `execution.workspace_name: ${spec.execution.workspace_name}`,
    `execution.publish_allowed: ${spec.execution.publish_allowed}`,
    `execution.create_container_version_allowed: ${spec.execution.create_container_version_allowed}`,
    `execution.destructive_changes_allowed: ${spec.execution.destructive_changes_allowed}`,
    `execution.require_human_approval: ${spec.execution.require_human_approval}`,
    `ga4_admin.custom_dimensions: ${spec.ga4_admin.custom_dimensions.length}`,
    `ga4_admin.custom_metrics: ${spec.ga4_admin.custom_metrics.length}`,
    `ga4_admin.key_events: ${spec.ga4_admin.key_events.length}`,
    `gtm_web.enabled: ${spec.gtm_web.enabled}`,
    `gtm_web.built_in_variables: ${spec.gtm_web.built_in_variables.length}`,
    `gtm_web.data_layer_variables: ${spec.gtm_web.data_layer_variables.length}`,
    `gtm_web.triggers: ${spec.gtm_web.triggers.length}`,
    `gtm_web.tags: ${spec.gtm_web.tags.length}`,
    `gtm_web.ecommerce.enabled: ${spec.gtm_web.ecommerce?.enabled ?? false}`,
    `sgtm.enabled: ${spec.sgtm?.enabled ?? false}`,
  ];

  return lines.join("\n") + "\n";
}
