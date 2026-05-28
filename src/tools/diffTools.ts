// src/tools/diffTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { validateSpec } from "../spec/validateSpec.js";
import { toDesiredState } from "../planner/desiredState.js";
import { toCurrentState } from "../planner/currentState.js";
import { diffStates } from "../planner/diff.js";
import { buildGa4Admin } from "../ga4/adminClient.js";
import { buildGtm } from "../gtm/tagManagerClient.js";
import { readProperty } from "../ga4/properties.js";
import { listDataStreams } from "../ga4/streams.js";
import { listCustomDimensions } from "../ga4/customDimensions.js";
import { listCustomMetrics } from "../ga4/customMetrics.js";
import { listKeyEvents } from "../ga4/keyEvents.js";
import { listBuiltInVariables } from "../gtm/builtInVariables.js";
import { listVariables } from "../gtm/variables.js";
import { listTriggers } from "../gtm/triggers.js";
import { listTags } from "../gtm/tags.js";
import { MCPError } from "../utils/errors.js";
import { audit } from "../safety/auditLog.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

export function registerDiffTools(server: McpServer, registered: ToolMeta[]) {
  const description =
    "[read-only] Reads current GA4 and GTM state, normalizes the spec into a desired state, and returns a deterministic diff. Performs no writes.";

  server.registerTool(
    "diff_ga4_gtm_state",
    {
      description,
      inputSchema: {
        spec_path: z.string(),
        account_id: z.string(),
        container_id: z.string(),
        workspace_id: z.string(),
        ga4_property_id: z.string(),
      },
    },
    async ({ spec_path, account_id, container_id, workspace_id, ga4_property_id }) => {
      try {
        const spec = await readSpec(spec_path);
        const v = validateSpec(spec);
        if (!v.ok) {
          throw new MCPError("SPEC_INVALID", "Spec failed semantic validation", { errors: v.errors });
        }

        const [ga4, gtm] = await Promise.all([buildGa4Admin("read"), buildGtm("read")]);
        const [property, , customDimensions, customMetrics, keyEvents, builtInVariables, variables, triggers, tags] = await Promise.all([
          readProperty(ga4, ga4_property_id),
          listDataStreams(ga4, ga4_property_id),
          listCustomDimensions(ga4, ga4_property_id),
          listCustomMetrics(ga4, ga4_property_id),
          listKeyEvents(ga4, ga4_property_id),
          listBuiltInVariables(gtm, account_id, container_id, workspace_id),
          listVariables(gtm, account_id, container_id, workspace_id),
          listTriggers(gtm, account_id, container_id, workspace_id),
          listTags(gtm, account_id, container_id, workspace_id),
        ]);

        const desired = toDesiredState(spec);
        const current = toCurrentState({
          ga4: {
            customDimensions: customDimensions as Record<string, unknown>[],
            customMetrics: customMetrics as Record<string, unknown>[],
            keyEvents: keyEvents as Record<string, unknown>[],
          },
          gtm: {
            builtInVariables: builtInVariables as Record<string, unknown>[],
            variables: variables as Record<string, unknown>[],
            triggers: triggers as Record<string, unknown>[],
            tags: tags as Record<string, unknown>[],
          },
        });
        const diff = diffStates(desired, current);

        await audit("diff_generated", {
          spec_path,
          ga4_property_id,
          gtm_container_id: container_id,
          workspace_id,
          counts: { creates: diff.creates.length, updates: diff.updates.length, unchanged: diff.unchanged.length, blocked: diff.blocked.length },
        });

        return { content: [{ type: "text", text: JSON.stringify({ property: property.name, diff }, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "diff_ga4_gtm_state", description, hasApprovalToken: false });
}
