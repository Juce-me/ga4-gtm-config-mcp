// src/tools/readTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { MCPError } from "../utils/errors.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

import { buildGa4Admin } from "../ga4/adminClient.js";
import { readProperty } from "../ga4/properties.js";
import { listDataStreams } from "../ga4/streams.js";
import { listCustomDimensions } from "../ga4/customDimensions.js";
import { listCustomMetrics } from "../ga4/customMetrics.js";
import { listKeyEvents } from "../ga4/keyEvents.js";
import { listMetadata as listMpSecretMetadata } from "../ga4/measurementProtocolSecrets.js";

import { buildGtm } from "../gtm/tagManagerClient.js";
import { listWorkspaces, workspaceCapacity } from "../gtm/workspaces.js";
import { listBuiltInVariables } from "../gtm/builtInVariables.js";
import { listVariables } from "../gtm/variables.js";
import { listTriggers } from "../gtm/triggers.js";
import { listTags } from "../gtm/tags.js";

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

  const ga4Desc =
    "[read-only] Returns normalized GA4 property, streams, custom dimensions, custom metrics, key events, and Measurement Protocol secret metadata only. Never returns secret values.";
  server.registerTool(
    "read_ga4_state",
    {
      description: ga4Desc,
      inputSchema: {
        ga4_property_id: z.string(),
        web_stream_id: z.string().optional(),
      },
    },
    async ({ ga4_property_id, web_stream_id }) => {
      try {
        const client = await buildGa4Admin("read");
        const [property, dataStreams, customDimensions, customMetrics, keyEvents] = await Promise.all([
          readProperty(client, ga4_property_id),
          listDataStreams(client, ga4_property_id),
          listCustomDimensions(client, ga4_property_id),
          listCustomMetrics(client, ga4_property_id),
          listKeyEvents(client, ga4_property_id),
        ]);
        // MP secret metadata is only fetched when a stream is supplied — listing
        // across all streams is more API surface than we need for the dry-run flow.
        const measurementProtocolSecrets = web_stream_id
          ? await listMpSecretMetadata(client, ga4_property_id, web_stream_id)
          : [];
        const result = { property, dataStreams, customDimensions, customMetrics, keyEvents, measurementProtocolSecrets };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "read_ga4_state", description: ga4Desc, hasApprovalToken: false });

  const gtmDesc =
    "[read-only] Returns normalized GTM container state for the given account/container, including workspace capacity.";
  server.registerTool(
    "read_gtm_state",
    {
      description: gtmDesc,
      inputSchema: {
        account_id: z.string(),
        container_id: z.string(),
        workspace_id: z.string().optional(),
      },
    },
    async ({ account_id, container_id, workspace_id }) => {
      try {
        const gtm = await buildGtm("read");
        const [workspaces, capacity] = await Promise.all([
          listWorkspaces(gtm, account_id, container_id),
          workspaceCapacity(gtm, account_id, container_id),
        ]);

        let workspaceContent: Record<string, unknown> = {};
        if (workspace_id) {
          const [builtInVariables, variables, triggers, tags] = await Promise.all([
            listBuiltInVariables(gtm, account_id, container_id, workspace_id),
            listVariables(gtm, account_id, container_id, workspace_id),
            listTriggers(gtm, account_id, container_id, workspace_id),
            listTags(gtm, account_id, container_id, workspace_id),
          ]);
          workspaceContent = { builtInVariables, variables, triggers, tags };
        }

        const result = { workspaces, capacity, workspaceContent };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "read_gtm_state", description: gtmDesc, hasApprovalToken: false });
}
