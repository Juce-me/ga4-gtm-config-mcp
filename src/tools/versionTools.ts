// src/tools/versionTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { validateSpec } from "../spec/validateSpec.js";
import { buildGtm } from "../gtm/tagManagerClient.js";
import { createVersion } from "../gtm/versions.js";
import { manualValidationChecklist } from "../gtm/preview.js";
import { gateVersionCreation } from "../safety/versionGuards.js";
import { MCPError } from "../utils/errors.js";
import { audit } from "../safety/auditLog.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

export function registerVersionTools(server: McpServer, registered: ToolMeta[]) {
  const description =
    "[gated dangerous] Creates a GTM container version from the named workspace. Note: this removes the workspace. Requires spec.execution.create_container_version_allowed: true and an explicit approval_token.";
  server.registerTool(
    "create_gtm_container_version_gated",
    {
      description,
      inputSchema: {
        spec_path: z.string(),
        account_id: z.string(),
        container_id: z.string(),
        workspace_id: z.string(),
        approval_token: z.string(),
        diff_report_path: z.string(),
        version_name: z.string(),
        notes: z.string().optional(),
      },
    },
    async ({ spec_path, account_id, container_id, workspace_id, approval_token, diff_report_path, version_name, notes }) => {
      try {
        const spec = await readSpec(spec_path);
        const validation = validateSpec(spec);
        const gate = await gateVersionCreation({
          spec,
          approval_token,
          diff_report_path,
          workspace_id,
          unresolved_blocked_items: 0,
          unresolved_validation_errors: validation.errors.length,
        });
        if (!gate.ok) {
          await audit("version_blocked", { container_id, reasons: gate.reasons });
          throw new MCPError("VERSION_CREATION_BLOCKED", "Version creation gate blocked", {
            reasons: gate.reasons,
            validation_errors: validation.errors,
          });
        }
        const gtm = await buildGtm("version");
        const created = await createVersion(gtm, account_id, container_id, workspace_id, version_name, notes);
        await audit("version_created", { container_id, workspace_id });
        return { content: [{ type: "text", text: JSON.stringify({
          version: created,
          manualValidationChecklist: manualValidationChecklist(),
          note: "Workspace was removed by this operation (GTM behavior). Publish remains blocked.",
        }, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "create_gtm_container_version_gated", description, hasApprovalToken: true });
}
