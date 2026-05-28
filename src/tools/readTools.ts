// src/tools/readTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { MCPError } from "../utils/errors.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

export type { ToolMeta };

export function registerReadTools(server: McpServer, registered: ToolMeta[]) {
  const description =
    "[read-only] Loads and returns the parsed mcp-execution.yaml at the given path. Does not call any Google API.";

  server.registerTool(
    "read_mcp_execution_spec",
    {
      description,
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      try {
        const spec = await readSpec(path);
        return { content: [{ type: "text", text: JSON.stringify(spec, null, 2) }] };
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
  registered.push({ name: "read_mcp_execution_spec", description, hasApprovalToken: false });
}
