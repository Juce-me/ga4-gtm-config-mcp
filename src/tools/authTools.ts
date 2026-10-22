// src/tools/authTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkAuthStatus, defaultAuthStatusDeps } from "../auth/authStatus.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

export function registerAuthTools(server: McpServer, registered: ToolMeta[]) {
  const description =
    "[read-only] Diagnoses Google authorization step by step: ADC selector, access token, granted scopes, publish gate, and optional GA4/GTM read access. Returns the next setup step for each failure. Performs no writes.";

  server.registerTool(
    "check_auth_status",
    {
      description,
      inputSchema: {
        ga4_property_id: z.string().optional(),
        account_id: z.string().optional(),
        container_id: z.string().optional(),
      },
    },
    async (input) => {
      const status = await checkAuthStatus(input, defaultAuthStatusDeps());
      const failed = status.checks.some((c) => c.status === "fail");
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }], ...(failed ? { isError: true } : {}) };
    },
  );
  registered.push({ name: "check_auth_status", description, hasApprovalToken: false });
}
