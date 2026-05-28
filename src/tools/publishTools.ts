// src/tools/publishTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { buildGtm } from "../gtm/tagManagerClient.js";
import { publishVersion } from "../gtm/publish.js";
import { gatePublish } from "../safety/publishGuards.js";
import { MCPError } from "../utils/errors.js";
import { audit } from "../safety/auditLog.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

export function registerPublishTools(server: McpServer, registered: ToolMeta[]) {
  const description =
    "[gated dangerous] Publishes a GTM container version. Default behavior is to refuse. Requires every publish-guard condition to pass plus an explicit approval_token.";
  server.registerTool(
    "publish_gtm_version_gated",
    {
      description,
      inputSchema: {
        spec_path: z.string(),
        account_id: z.string(),
        container_id: z.string(),
        version_id: z.string(),
        approval_token: z.string(),
        validation_report_path: z.string(),
        environment: z.string(),
        operator_requested_publish: z.boolean(),
      },
    },
    async ({ spec_path, account_id, container_id, version_id, approval_token, validation_report_path, environment, operator_requested_publish }) => {
      try {
        const spec = await readSpec(spec_path);
        const gate = await gatePublish({
          spec,
          approval_token,
          validation_report_path,
          environment,
          version_id,
          publish_scope_present: process.env.INCLUDE_PUBLISH_SCOPE === "1",
          operator_requested_publish,
        });
        if (!gate.ok) {
          await audit("publish_blocked", { container_id, reasons: gate.reasons });
          throw new MCPError("PUBLISH_BLOCKED", "Publish gate blocked", { reasons: gate.reasons });
        }
        const gtm = await buildGtm("publish");
        const result = await publishVersion(gtm, account_id, container_id, version_id);
        await audit("publish_succeeded", { container_id, version_id });
        return { content: [{ type: "text", text: JSON.stringify({ published: result }, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "publish_gtm_version_gated", description, hasApprovalToken: true });
}
