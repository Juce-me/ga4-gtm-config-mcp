import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const invalidSpec = {
  execution: {
    create_container_version_allowed: true,
    publish_allowed: true,
  },
  target: {
    environment: "prod",
  },
  gtm_web: {
    data_layer_variables: [],
    built_in_variables: [],
    triggers: [],
    tags: [
      {
        name: "GA4 - Bad",
        type: "ga4_event",
        event_name: "{{DLV - event_name}}",
        trigger: "CE - userevent - event",
        params: { event_category: "{{DLV - event_category}}" },
      },
    ],
  },
  ga4_admin: {
    custom_dimensions: [],
    custom_metrics: [],
    key_events: [],
  },
  validation: {},
};

function fakeServer() {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  return {
    server: {
      registerTool(name: string, _config: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) {
        handlers.set(name, handler);
      },
    },
    handlers,
  };
}

describe("gated tool validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("../src/spec/readSpec.js", () => ({
      readSpec: vi.fn(async () => invalidSpec),
    }));
    vi.doMock("../src/gtm/tagManagerClient.js", () => ({
      buildGtm: vi.fn(async () => ({})),
    }));
  });

  afterEach(() => {
    vi.doUnmock("../src/spec/readSpec.js");
    vi.doUnmock("../src/gtm/tagManagerClient.js");
    vi.doUnmock("../src/gtm/versions.js");
    vi.doUnmock("../src/gtm/publish.js");
    vi.unstubAllEnvs();
    rmSync("tests/.tmp-gated-tools", { recursive: true, force: true });
  });

  it("create_gtm_container_version_gated blocks a semantically invalid spec before calling GTM", async () => {
    const createVersion = vi.fn(async () => ({ containerVersion: { name: "v1" } }));
    vi.doMock("../src/gtm/versions.js", () => ({ createVersion }));
    const { registerVersionTools } = await import("../src/tools/versionTools.js");
    const { server, handlers } = fakeServer();
    registerVersionTools(server as never, []);

    const result = await handlers.get("create_gtm_container_version_gated")!({
      spec_path: "invalid.yaml",
      account_id: "accounts/1",
      container_id: "accounts/1/containers/2",
      workspace_id: "3",
      approval_token: "token",
      diff_report_path: "tests/fixtures/specs/valid-web-dry-run.yaml",
      version_name: "v1",
    });

    expect(createVersion).not.toHaveBeenCalled();
    expect(result).toMatchObject({ isError: true });
    expect(JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text).error.code).toBe("VERSION_CREATION_BLOCKED");
  });

  it("publish_gtm_version_gated blocks a semantically invalid spec before calling GTM", async () => {
    mkdirSync("tests/.tmp-gated-tools", { recursive: true });
    writeFileSync("tests/.tmp-gated-tools/validation.txt", "passed", "utf8");
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");
    const publishVersion = vi.fn(async () => ({ containerVersion: { name: "v1" } }));
    vi.doMock("../src/gtm/publish.js", () => ({ publishVersion }));
    const { registerPublishTools } = await import("../src/tools/publishTools.js");
    const { server, handlers } = fakeServer();
    registerPublishTools(server as never, []);

    const result = await handlers.get("publish_gtm_version_gated")!({
      spec_path: "invalid.yaml",
      account_id: "accounts/1",
      container_id: "accounts/1/containers/2",
      version_id: "7",
      approval_token: "token",
      validation_report_path: "tests/.tmp-gated-tools/validation.txt",
      environment: "prod",
      operator_requested_publish: true,
    });

    expect(publishVersion).not.toHaveBeenCalled();
    expect(result).toMatchObject({ isError: true });
    expect(JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text).error.code).toBe("PUBLISH_BLOCKED");
  });
});
