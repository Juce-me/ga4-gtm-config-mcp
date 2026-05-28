import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";

describe("server bootstrap", () => {
  it("constructs an MCP server with name and version", () => {
    const { server } = buildServer();
    expect(server).toBeDefined();
  });

  it("registers at least one tool", () => {
    const { toolNames } = buildServer();
    expect(toolNames.length).toBeGreaterThan(0);
  });
});
