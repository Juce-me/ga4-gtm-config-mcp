import { describe, it, expect } from "vitest";
import { capabilityOf } from "../src/ga4/capabilities.js";

describe("ga4 capabilities map", () => {
  it("declares CDs/CMs/key events/MP secrets as stable", () => {
    expect(capabilityOf("list_custom_dimensions")).toBe("stable");
    expect(capabilityOf("create_custom_dimension")).toBe("stable");
    expect(capabilityOf("update_custom_dimension")).toBe("stable");
    expect(capabilityOf("list_custom_metrics")).toBe("stable");
    expect(capabilityOf("create_custom_metric")).toBe("stable");
    expect(capabilityOf("update_custom_metric")).toBe("stable");
    expect(capabilityOf("list_key_events")).toBe("stable");
    expect(capabilityOf("create_key_event")).toBe("stable");
    expect(capabilityOf("update_key_event")).toBe("stable");
    expect(capabilityOf("list_mp_secrets_metadata")).toBe("stable");
    expect(capabilityOf("create_mp_secret")).toBe("stable");
  });

  it("declares read_property and list_data_streams as stable", () => {
    expect(capabilityOf("read_property")).toBe("stable");
    expect(capabilityOf("list_data_streams")).toBe("stable");
  });

  it("declares archive_custom_dimension as unsupported", () => {
    expect(capabilityOf("archive_custom_dimension")).toBe("unsupported");
  });

  it("returns 'unsupported' for unknown operations", () => {
    expect(capabilityOf("invent_a_metric_out_of_thin_air")).toBe("unsupported");
  });
});
