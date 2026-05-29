import type { tagmanager_v2 } from "googleapis";
import { MCPError } from "../utils/errors.js";
import type { UpsertResult } from "./upsertResult.js";
import { gtmEntityMatches } from "./upsertResult.js";
import { workspacePath, workspacePathFromName } from "./idPaths.js";

export async function listTriggers(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  workspaceId: string,
) {
  const res = await gtm.accounts.containers.workspaces.triggers.list({
    parent: workspacePath(accountId, containerId, workspaceId),
  });
  return res.data.trigger ?? [];
}

export async function createTrigger(
  gtm: tagmanager_v2.Tagmanager,
  workspaceRef: string,
  payload: Record<string, unknown>,
) {
  const normalizedWorkspaceRef = workspacePathFromName(workspaceRef);
  const res = await gtm.accounts.containers.workspaces.triggers.create({
    parent: normalizedWorkspaceRef,
    requestBody: payload as unknown as tagmanager_v2.Schema$Trigger,
  });
  return res.data;
}

export async function updateTrigger(
  gtm: tagmanager_v2.Tagmanager,
  path: string,
  payload: Record<string, unknown>,
) {
  const res = await gtm.accounts.containers.workspaces.triggers.update({
    path,
    requestBody: payload as unknown as tagmanager_v2.Schema$Trigger,
  });
  return res.data;
}

export async function upsertTrigger(
  gtm: tagmanager_v2.Tagmanager,
  workspaceRef: string,
  payload: Record<string, unknown>,
  existing?: tagmanager_v2.Schema$Trigger & { path?: string },
): Promise<UpsertResult<tagmanager_v2.Schema$Trigger>> {
  if (!existing) {
    return { action: "create", entity: await createTrigger(gtm, workspaceRef, payload) };
  }
  if (gtmEntityMatches("trigger", existing as Record<string, unknown>, payload)) {
    return { action: "unchanged", entity: existing };
  }
  const pathStr = existing.path ?? (() => {
    const id = existing.triggerId;
    if (!id) throw new MCPError("API_UNSUPPORTED", "existing trigger has no triggerId; cannot update");
    return `${workspacePathFromName(workspaceRef)}/triggers/${id}`;
  })();
  return { action: "update", entity: await updateTrigger(gtm, pathStr, payload) };
}
