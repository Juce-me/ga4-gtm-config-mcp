export type Capability = "stable" | "beta" | "alpha" | "unsupported";

const MAP: Record<string, Capability> = {
  read_property: "stable",
  list_data_streams: "stable",
  list_custom_dimensions: "stable",
  create_custom_dimension: "stable",
  update_custom_dimension: "stable",
  archive_custom_dimension: "unsupported",
  list_custom_metrics: "stable",
  create_custom_metric: "stable",
  update_custom_metric: "stable",
  list_key_events: "stable",
  create_key_event: "stable",
  update_key_event: "stable",
  list_mp_secrets_metadata: "stable",
  create_mp_secret: "stable",
};

export function capabilityOf(op: string): Capability {
  return MAP[op] ?? "unsupported";
}
