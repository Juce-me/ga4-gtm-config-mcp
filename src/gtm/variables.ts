import type { tagmanager_v2 } from "googleapis";
import { MCPError } from "../utils/errors.js";
import type { UpsertResult } from "./upsertResult.js";
import { gtmEntityMatches } from "./upsertResult.js";
import { workspacePath, workspacePathFromName } from "./idPaths.js";

export async function listVariables(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  workspaceId: string,
) {
  const res = await gtm.accounts.containers.workspaces.variables.list({
    parent: workspacePath(accountId, containerId, workspaceId),
  });
  return res.data.variable ?? [];
}

export async function createVariable(
  gtm: tagmanager_v2.Tagmanager,
  workspaceRef: string,
  payload: Record<string, unknown>,
) {
  const normalizedWorkspaceRef = workspacePathFromName(workspaceRef);
  const res = await gtm.accounts.containers.workspaces.variables.create({
    parent: normalizedWorkspaceRef,
    requestBody: payload as unknown as tagmanager_v2.Schema$Variable,
  });
  return res.data;
}

export async function updateVariable(
  gtm: tagmanager_v2.Tagmanager,
  path: string,
  payload: Record<string, unknown>,
) {
  const res = await gtm.accounts.containers.workspaces.variables.update({
    path,
    requestBody: payload as unknown as tagmanager_v2.Schema$Variable,
  });
  return res.data;
}

export async function upsertVariable(
  gtm: tagmanager_v2.Tagmanager,
  workspaceRef: string,
  payload: Record<string, unknown>,
  existing?: tagmanager_v2.Schema$Variable & { path?: string },
): Promise<UpsertResult<tagmanager_v2.Schema$Variable>> {
  if (!existing) {
    return { action: "create", entity: await createVariable(gtm, workspaceRef, payload) };
  }
  if (gtmEntityMatches("variable", existing as Record<string, unknown>, payload)) {
    return { action: "unchanged", entity: existing };
  }
  const pathStr = existing.path ?? (() => {
    const id = existing.variableId;
    if (!id) throw new MCPError("API_UNSUPPORTED", "existing variable has no variableId; cannot update");
    return `${workspacePathFromName(workspaceRef)}/variables/${id}`;
  })();
  return { action: "update", entity: await updateVariable(gtm, pathStr, payload) };
}
