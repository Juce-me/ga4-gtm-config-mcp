import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";
import { validateSpec } from "../src/spec/validateSpec.js";

const cases: Array<[string, string]> = [
  ["invalid-ua-fields.yaml", "SPEC_INVALID"],
  ["invalid-secret-in-spec.yaml", "SECRET_DETECTED"],
  ["invalid-high-card-cd.yaml", "PII_DETECTED"],
  ["invalid-per-event-tag.yaml", "SPEC_INVALID"],
  ["invalid-consent-change.yaml", "CONSENT_CHANGE_BLOCKED"],
];

describe("validateSpec", () => {
  async function validSpec() {
    return readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
  }

  it("passes the valid fixture", async () => {
    const spec = await validSpec();
    const r = validateSpec(spec);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects unsupported planner-facing GTM built-ins", async () => {
    const spec = await validSpec();
    spec.gtm_web.built_in_variables = ["Page URL", "Page Path", "Page Hostname", "Referrer", "Event", "Page Title"];

    const r = validateSpec(spec);

    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual(expect.objectContaining({
      code: "SPEC_INVALID",
      path: "gtm_web.built_in_variables[5]",
    }));
  });

  it("rejects tag params with PII keys through semantic validation", async () => {
    const spec = await validSpec();
    spec.gtm_web.tags[0]!.params.email = "{{DLV - email}}";

    const r = validateSpec(spec);

    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual(expect.objectContaining({
      code: "PII_DETECTED",
      path: "gtm_web.tags[0].params.email",
    }));
  });

  it("rejects secret-shaped tag param keys even when validation.forbidden_keys is omitted", async () => {
    const spec = await validSpec();
    delete spec.validation;
    spec.gtm_web.tags[0]!.params.api_key = "{{DLV - api_key}}";

    const r = validateSpec(spec);

    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual(expect.objectContaining({
      code: "SECRET_DETECTED",
      path: "gtm_web.tags[0].params.api_key",
    }));
  });

  it("applies forbidden exact, contains, and pattern checks to planner-controlled names", async () => {
    const spec = await validSpec();
    spec.gtm_web.tags[0]!.params.name = "safe";
    spec.gtm_web.tags[1]!.params.feature_name = "{{DLV - access_token}}";
    spec.gtm_web.data_layer_variables[0]!.data_layer_variable_name = "a@b.c";
    spec.ga4_admin.custom_dimensions[0]!.parameter_name = "oauth";
    spec.ga4_admin.custom_metrics[0]!.parameter_name = "phone";
    spec.ga4_admin.key_events[0]!.event_name = "x?q=1";

    const r = validateSpec(spec);

    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PII_DETECTED", path: "gtm_web.tags[0].params.name" }),
      expect.objectContaining({ code: "SECRET_DETECTED", path: "gtm_web.tags[1].params.feature_name" }),
      expect.objectContaining({ code: "PII_DETECTED", path: "gtm_web.data_layer_variables[0].data_layer_variable_name" }),
      expect.objectContaining({ code: "SECRET_DETECTED", path: "ga4_admin.custom_dimensions[0].parameter_name" }),
      expect.objectContaining({ code: "PII_DETECTED", path: "ga4_admin.custom_metrics[0].parameter_name" }),
      expect.objectContaining({ code: "PII_DETECTED", path: "ga4_admin.key_events[0].event_name" }),
    ]));
  });

  it("rejects GA4 unsafe names before apply", async () => {
    const spec = await validSpec();
    spec.gtm_web.tags[1]!.params["_internal_param"] = "{{DLV - eventParams._internal_param}}";
    spec.ga4_admin.custom_dimensions[0]!.parameter_name = "firebase_custom_name";
    spec.ga4_admin.custom_metrics[0]!.parameter_name = "a".repeat(41);
    spec.ga4_admin.key_events[0]!.event_name = "event_name_that_is_definitely_more_than_forty_chars";
    spec.ga4_admin.custom_dimensions.push({
      display_name: "Currency",
      parameter_name: "currency",
      scope: "EVENT",
    });

    const r = validateSpec(spec);

    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SPEC_INVALID", path: "gtm_web.tags[1].params._internal_param" }),
      expect.objectContaining({ code: "SPEC_INVALID", path: "ga4_admin.custom_dimensions[0].parameter_name" }),
      expect.objectContaining({ code: "SPEC_INVALID", path: "ga4_admin.custom_metrics[0].parameter_name" }),
      expect.objectContaining({ code: "SPEC_INVALID", path: "ga4_admin.key_events[0].event_name" }),
      expect.objectContaining({ code: "PII_DETECTED", path: "ga4_admin.custom_dimensions[1]" }),
    ]));
  });

  it("rejects normal GTM tags with more than 25 params", async () => {
    const spec = await validSpec();
    spec.gtm_web.tags[1]!.params = Object.fromEntries(
      Array.from({ length: 26 }, (_, i) => [`param_${i}`, `{{DLV - eventParams.param_${i}}}`]),
    );

    const r = validateSpec(spec);

    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual(expect.objectContaining({
      code: "SPEC_INVALID",
      path: "gtm_web.tags[1].params",
    }));
  });

  for (const [file, code] of cases) {
    it(`rejects ${file} with ${code}`, async () => {
      const spec = await readSpec(`tests/fixtures/specs/${file}`).catch((e) => e);
      // For SPEC_INVALID at schema level, readSpec throws. For semantic violations,
      // readSpec succeeds and validateSpec returns the error.
      if (spec instanceof Error) {
        expect((spec as { code?: string }).code).toBe(code);
      } else {
        const r = validateSpec(spec);
        expect(r.ok).toBe(false);
        expect(r.errors.map((e) => e.code)).toContain(code);
      }
    });
  }
});
