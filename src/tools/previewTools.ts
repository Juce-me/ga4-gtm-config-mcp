// src/tools/previewTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildGtm } from "../gtm/tagManagerClient.js";
import { getPreviewInfo, manualValidationChecklist } from "../gtm/preview.js";
import { MCPError } from "../utils/errors.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

export function registerPreviewTools(server: McpServer, registered: ToolMeta[]) {
  const description =
    "[read-only] Returns workspace metadata and a fixed manual Tag Assistant / DebugView checklist. Does not create a version.";
  server.registerTool(
    "get_gtm_preview_info",
    {
      description,
      inputSchema: {
        account_id: z.string(),
        container_id: z.string(),
        workspace_id: z.string(),
      },
    },
    async ({ account_id, container_id, workspace_id }) => {
      try {
        // If env auth is absent, still return the manual checklist so the operator
        // can validate by hand even without API access. This intentionally degrades
        // gracefully — fabricating a preview URL would be worse.
        try {
          const gtm = await buildGtm("read");
          const info = await getPreviewInfo(gtm, account_id, container_id, workspace_id);
          return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text", text: JSON.stringify({
            workspace: null,
            manualChecklist: manualValidationChecklist(),
            note: `Could not reach GTM API (${String(e)}); returned manual checklist only.`,
          }, null, 2) }] };
        }
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "get_gtm_preview_info", description, hasApprovalToken: false });
}
