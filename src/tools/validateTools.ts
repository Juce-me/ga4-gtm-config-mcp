// src/tools/validateTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { validateSpec } from "../spec/validateSpec.js";
import { summarizeSpec } from "../spec/summarize.js";
import { MCPError } from "../utils/errors.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

export function registerValidateTools(server: McpServer, registered: ToolMeta[]) {
  const validateDesc =
    "[read-only] Runs schema and semantic validation on a spec file and returns ok/warnings/errors. Does not call any Google API.";
  server.registerTool(
    "validate_mcp_execution_spec",
    { description: validateDesc, inputSchema: { path: z.string() } },
    async ({ path }) => {
      try {
        const spec = await readSpec(path);
        const result = validateSpec(spec);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return {
            content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }],
            isError: true,
          };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "validate_mcp_execution_spec", description: validateDesc, hasApprovalToken: false });

  const summaryDesc =
    "[read-only] Returns a human-readable summary of the spec, including all four gate booleans.";
  server.registerTool(
    "summarize_mcp_execution_spec",
    { description: summaryDesc, inputSchema: { path: z.string() } },
    async ({ path }) => {
      try {
        const spec = await readSpec(path);
        return { content: [{ type: "text", text: summarizeSpec(spec) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return {
            content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }],
            isError: true,
          };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "summarize_mcp_execution_spec", description: summaryDesc, hasApprovalToken: false });
}
