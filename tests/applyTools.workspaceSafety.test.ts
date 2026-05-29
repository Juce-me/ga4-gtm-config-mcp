import { describe, it, expect, vi, afterEach } from "vitest";
import { registerApplyTools } from "../src/tools/applyTools.js";

const mocks = vi.hoisted(() => ({
  buildGtm: vi.fn(async () => ({})),
  listBuiltInVariables: vi.fn(async () => []),
  listVariables: vi.fn(async () => []),
  listTriggers: vi.fn(async () => []),
  listTags: vi.fn(async () => []),
  enableBuiltIn: vi.fn(),
  upsertVariable: vi.fn(),
  upsertTrigger: vi.fn(),
  upsertTag: vi.fn(),
  findByName: vi.fn(),
  createWorkspace: vi.fn(),
  workspaceCapacity: vi.fn(),
}));

vi.mock("../src/gtm/tagManagerClient.js", () => ({
  buildGtm: mocks.buildGtm,
}));
vi.mock("../src/gtm/builtInVariables.js", () => ({
  listBuiltInVariables: mocks.listBuiltInVariables,
  enableBuiltIn: mocks.enableBuiltIn,
}));
vi.mock("../src/gtm/variables.js", () => ({
  listVariables: mocks.listVariables,
  upsertVariable: mocks.upsertVariable,
}));
vi.mock("../src/gtm/triggers.js", () => ({
  listTriggers: mocks.listTriggers,
  upsertTrigger: mocks.upsertTrigger,
}));
vi.mock("../src/gtm/tags.js", () => ({
  listTags: mocks.listTags,
  upsertTag: mocks.upsertTag,
}));
vi.mock("../src/gtm/workspaces.js", () => ({
  findByName: mocks.findByName,
  createWorkspace: mocks.createWorkspace,
  workspaceCapacity: mocks.workspaceCapacity,
}));

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

describe("apply_gtm_workspace_changes workspace safety", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks full-resource live workspace IDs before reading GTM state", async () => {
    const { server, handlers } = fakeServer();
    registerApplyTools(server as never, []);

    const result = await handlers.get("apply_gtm_workspace_changes")!({
      spec_path: "tests/fixtures/specs/valid-web-dry-run.yaml",
      account_id: "accounts/1",
      container_id: "accounts/1/containers/2",
      workspace_id: "accounts/1/containers/2/workspaces/0",
      dry_run: true,
    });

    expect(mocks.listBuiltInVariables).not.toHaveBeenCalled();
    expect(mocks.listVariables).not.toHaveBeenCalled();
    expect(mocks.listTriggers).not.toHaveBeenCalled();
    expect(mocks.listTags).not.toHaveBeenCalled();
    expect(result).toMatchObject({ isError: true });
    expect(JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text).error.code).toBe("WORKSPACE_UNSAFE");
  });
});
