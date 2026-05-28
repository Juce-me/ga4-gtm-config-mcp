// src/tools/applyTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { validateSpec } from "../spec/validateSpec.js";
import { toDesiredState } from "../planner/desiredState.js";
import { toCurrentState } from "../planner/currentState.js";
import { diffStates } from "../planner/diff.js";
import { applyPlan, type Writers } from "../planner/applyPlan.js";
import { buildGa4Admin } from "../ga4/adminClient.js";
import { buildGtm } from "../gtm/tagManagerClient.js";
import { listCustomDimensions, upsertCustomDimension } from "../ga4/customDimensions.js";
import { listCustomMetrics, upsertCustomMetric } from "../ga4/customMetrics.js";
import { listKeyEvents, upsertKeyEvent } from "../ga4/keyEvents.js";
import { listBuiltInVariables, enableBuiltIn } from "../gtm/builtInVariables.js";
import { listVariables, upsertVariable } from "../gtm/variables.js";
import { listTriggers, upsertTrigger } from "../gtm/triggers.js";
import { listTags, upsertTag } from "../gtm/tags.js";
import { findByName, createWorkspace, workspaceCapacity } from "../gtm/workspaces.js";
import { assertWorkspaceSafe } from "../safety/workspaceGuards.js";
import { gateConsentChange } from "../safety/consentGuards.js";
import { findDestructiveChanges } from "../safety/destructiveChangeGuards.js";
import { MCPError } from "../utils/errors.js";
import { audit } from "../safety/auditLog.js";
import type { ToolMeta } from "../safety/toolMetadataGuards.js";

export function registerApplyTools(server: McpServer, registered: ToolMeta[]) {
  // ---------------- create_gtm_workspace ----------------
  const cwDesc =
    "[write — non-live workspace only] Creates a new GTM workspace in the given container. Blocks if container is at capacity or if the operator targets the live/default workspace.";
  server.registerTool(
    "create_gtm_workspace",
    {
      description: cwDesc,
      inputSchema: {
        account_id: z.string(),
        container_id: z.string(),
        workspace_name: z.string(),
        reuse_existing: z.boolean().default(false),
      },
    },
    async ({ account_id, container_id, workspace_name, reuse_existing }) => {
      try {
        const gtm = await buildGtm("write");
        const cap = await workspaceCapacity(gtm, account_id, container_id);

        if (reuse_existing) {
          const existing = await findByName(gtm, account_id, container_id, workspace_name);
          if (existing) {
            if (existing.workspaceId) {
              assertWorkspaceSafe({ workspaceId: existing.workspaceId, name: existing.name ?? "" });
            }
            await audit("workspace_reused", { account_id, container_id, workspace_id: existing.workspaceId });
            return { content: [{ type: "text", text: JSON.stringify({ action: "reused", workspace: existing }, null, 2) }] };
          }
        }

        if (!cap.capacityOk) {
          await audit("workspace_blocked", { account_id, container_id, reason: "capacity" });
          throw new MCPError("WORKSPACE_CAPACITY_BLOCKED", `GTM container has ${cap.existing}/${cap.max} workspaces. Delete or merge one before creating.`);
        }

        const created = await createWorkspace(gtm, account_id, container_id, workspace_name);
        if (created.workspaceId) {
          assertWorkspaceSafe({ workspaceId: created.workspaceId, name: created.name ?? "" });
        }
        await audit("workspace_created", { account_id, container_id, workspace_id: created.workspaceId });
        return { content: [{ type: "text", text: JSON.stringify({ action: "created", workspace: created }, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "create_gtm_workspace", description: cwDesc, hasApprovalToken: false });

  // ---------------- apply_gtm_workspace_changes ----------------
  const agDesc =
    "[dry-run-capable write] Upserts approved variables, triggers, and tags into the given non-live workspace. Defaults to dry_run: true. Never deletes. Never modifies consent unless approved in spec.";
  server.registerTool(
    "apply_gtm_workspace_changes",
    {
      description: agDesc,
      inputSchema: {
        spec_path: z.string(),
        account_id: z.string(),
        container_id: z.string(),
        workspace_id: z.string(),
        dry_run: z.boolean().default(true),
      },
    },
    async ({ spec_path, account_id, container_id, workspace_id, dry_run }) => {
      try {
        const spec = await readSpec(spec_path);
        const v = validateSpec(spec);
        if (!v.ok) throw new MCPError("SPEC_INVALID", "Spec failed semantic validation", { errors: v.errors });

        const consent = gateConsentChange(spec);
        if (!consent.ok) throw new MCPError(consent.code!, "Consent change requires explicit approval", { reasons: consent.reasons });

        const gtm = await buildGtm("write");
        // Workspace safety: refuse the live workspace.
        if (workspace_id === "0") {
          throw new MCPError("WORKSPACE_UNSAFE", "Refusing to apply changes to the live/default workspace (id=0)");
        }

        const [builtInVariables, variables, triggers, tags] = await Promise.all([
          listBuiltInVariables(gtm, account_id, container_id, workspace_id),
          listVariables(gtm, account_id, container_id, workspace_id),
          listTriggers(gtm, account_id, container_id, workspace_id),
          listTags(gtm, account_id, container_id, workspace_id),
        ]);

        const desired = toDesiredState(spec);
        // Empty out GA4 side of desired so this tool only applies GTM portion
        const gtmOnlyDesired = { ...desired, ga4: { customDimensions: [], customMetrics: [], keyEvents: [] } };

        const current = toCurrentState({
          ga4: { customDimensions: [], customMetrics: [], keyEvents: [] },
          gtm: {
            builtInVariables: builtInVariables as Record<string, unknown>[],
            variables: variables as Record<string, unknown>[],
            triggers: triggers as Record<string, unknown>[],
            tags: tags as Record<string, unknown>[],
          },
        });

        const diff = diffStates(gtmOnlyDesired, current);

        const destructive = findDestructiveChanges({ creates: diff.creates, updates: diff.updates, deletes: [], archives: [] }, spec);
        if (destructive.length > 0) {
          throw new MCPError("SPEC_INVALID", "Destructive changes detected; not allowed by spec", { findings: destructive });
        }

        const gtmWorkspaceRef = `accounts/${account_id}/containers/${container_id}/workspaces/${workspace_id}`;

        const writers: Writers = {
          upsertCustomDimension: async () => ({ action: "unchanged", entity: {} }),
          upsertCustomMetric:    async () => ({ action: "unchanged", entity: {} }),
          upsertKeyEvent:        async () => ({ action: "unchanged", entity: {} }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          upsertVariable: async (_unused: unknown, wsRef: unknown, payload: unknown, existing: unknown) =>
            upsertVariable(gtm, wsRef as string, payload as Record<string, unknown>, existing as Parameters<typeof upsertVariable>[3]),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          upsertTrigger: async (_unused: unknown, wsRef: unknown, payload: unknown, existing: unknown) =>
            upsertTrigger(gtm, wsRef as string, payload as Record<string, unknown>, existing as Parameters<typeof upsertTrigger>[3]),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          upsertTag: async (_unused: unknown, wsRef: unknown, payload: unknown, existing: unknown) =>
            upsertTag(gtm, wsRef as string, payload as Record<string, unknown>, existing as Parameters<typeof upsertTag>[3]),
          enableBuiltIn: async (_unused: unknown, wsRef: unknown, name: unknown) =>
            enableBuiltIn(gtm, wsRef as string, name as string),
        };

        type RawGtmArr<T> = Array<{ name?: string } & Record<string, unknown>> & T[];
        const summary = await applyPlan({
          diff,
          dryRun: dry_run,
          writers,
          ga4PropertyId: "",
          gtmWorkspaceRef,
          currentRaw: {
            ga4: { customDimensions: [], customMetrics: [], keyEvents: [] },
            gtm: {
              builtInVariables: builtInVariables as unknown as RawGtmArr<typeof builtInVariables[0]>,
              variables: variables as unknown as RawGtmArr<typeof variables[0]>,
              triggers: triggers as unknown as RawGtmArr<typeof triggers[0]>,
              tags: tags as unknown as RawGtmArr<typeof tags[0]>,
            },
          },
        });

        await audit("gtm_apply_summary", { account_id, container_id, workspace_id, dry_run, ...summary, details: undefined });

        return { content: [{ type: "text", text: JSON.stringify({ dry_run, ...summary }, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "apply_gtm_workspace_changes", description: agDesc, hasApprovalToken: false });

  // ---------------- apply_ga4_admin_changes ----------------
  const aaDesc =
    "[dry-run-capable write] Upserts approved GA4 custom dimensions, custom metrics, and key events. Defaults to dry_run: true. Never archives. Never stores Measurement Protocol secret values.";
  server.registerTool(
    "apply_ga4_admin_changes",
    {
      description: aaDesc,
      inputSchema: {
        spec_path: z.string(),
        ga4_property_id: z.string(),
        dry_run: z.boolean().default(true),
      },
    },
    async ({ spec_path, ga4_property_id, dry_run }) => {
      try {
        const spec = await readSpec(spec_path);
        const v = validateSpec(spec);
        if (!v.ok) throw new MCPError("SPEC_INVALID", "Spec failed semantic validation", { errors: v.errors });

        const ga4 = await buildGa4Admin("write");
        const [customDimensions, customMetrics, keyEvents] = await Promise.all([
          listCustomDimensions(ga4, ga4_property_id),
          listCustomMetrics(ga4, ga4_property_id),
          listKeyEvents(ga4, ga4_property_id),
        ]);

        const desired = toDesiredState(spec);
        const ga4OnlyDesired = { ...desired, gtm: { builtInVariables: [], variables: [], triggers: [], tags: [] } };
        const current = toCurrentState({
          ga4: {
            customDimensions: customDimensions as Record<string, unknown>[],
            customMetrics: customMetrics as Record<string, unknown>[],
            keyEvents: keyEvents as Record<string, unknown>[],
          },
          gtm: { builtInVariables: [], variables: [], triggers: [], tags: [] },
        });
        const diff = diffStates(ga4OnlyDesired, current);

        // GA4 archives are never proposed by us — defense in depth:
        const destructive = findDestructiveChanges({ creates: diff.creates, updates: diff.updates, deletes: [], archives: [] }, spec);
        if (destructive.length > 0) {
          throw new MCPError("SPEC_INVALID", "Destructive GA4 changes detected", { findings: destructive });
        }

        const writers: Writers = {
          upsertCustomDimension: async (_unused: unknown, propId: unknown, payload: unknown, existing: unknown) =>
            upsertCustomDimension(ga4, propId as string, payload as Parameters<typeof upsertCustomDimension>[2], existing as Parameters<typeof upsertCustomDimension>[3]),
          upsertCustomMetric: async (_unused: unknown, propId: unknown, payload: unknown, existing: unknown) =>
            upsertCustomMetric(ga4, propId as string, payload as Parameters<typeof upsertCustomMetric>[2], existing as Parameters<typeof upsertCustomMetric>[3]),
          upsertKeyEvent: async (_unused: unknown, propId: unknown, payload: unknown, existing: unknown) =>
            upsertKeyEvent(ga4, propId as string, payload as Parameters<typeof upsertKeyEvent>[2], existing as Parameters<typeof upsertKeyEvent>[3]),
          upsertVariable: async () => ({ action: "unchanged", entity: {} }),
          upsertTrigger:  async () => ({ action: "unchanged", entity: {} }),
          upsertTag:      async () => ({ action: "unchanged", entity: {} }),
          enableBuiltIn:  async () => ({ action: "unchanged", entity: { type: "" } }),
        };

        type RawGa4Arr<T> = Array<{ name?: string } & Record<string, unknown>> & T[];
        const summary = await applyPlan({
          diff,
          dryRun: dry_run,
          writers,
          ga4PropertyId: ga4_property_id,
          gtmWorkspaceRef: "",
          currentRaw: {
            ga4: {
              customDimensions: customDimensions as unknown as RawGa4Arr<typeof customDimensions[0]>,
              customMetrics: customMetrics as unknown as RawGa4Arr<typeof customMetrics[0]>,
              keyEvents: keyEvents as unknown as RawGa4Arr<typeof keyEvents[0]>,
            },
            gtm: { builtInVariables: [], variables: [], triggers: [], tags: [] },
          },
        });

        await audit("ga4_apply_summary", { ga4_property_id, dry_run, ...summary, details: undefined });

        return { content: [{ type: "text", text: JSON.stringify({ dry_run, ...summary }, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "apply_ga4_admin_changes", description: aaDesc, hasApprovalToken: false });
}
