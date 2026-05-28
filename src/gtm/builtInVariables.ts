import type { tagmanager_v2 } from "googleapis";
import { MCPError } from "../utils/errors.js";

export async function listBuiltInVariables(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  workspaceId: string,
) {
  const res = await gtm.accounts.containers.workspaces.built_in_variables.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  return res.data.builtInVariable ?? [];
}

/**
 * Idempotently enable a GTM built-in variable by its type name (e.g. "PAGE_URL").
 * The `name` param is the GTM type identifier, not the display name.
 * GTM will reject unknown type names — validation is delegated to the API.
 * The workspaceRef must be "accounts/A/containers/C/workspaces/W".
 */
export async function enableBuiltIn(
  gtm: tagmanager_v2.Tagmanager,
  workspaceRef: string,
  name: string,
): Promise<{ action: "create" | "unchanged"; entity: { type: string } }> {
  const parts = workspaceRef.split("/");
  const accountId = parts[1];
  const containerId = parts[3];
  const workspaceId = parts[5];
  if (!accountId || !containerId || !workspaceId) {
    throw new MCPError("API_UNSUPPORTED", `Invalid workspaceRef: ${workspaceRef}`);
  }
  const existing = await listBuiltInVariables(gtm, accountId, containerId, workspaceId);
  // Built-in variable type names come back in the `type` field.
  if (existing.some((e) => e.type === name)) {
    return { action: "unchanged", entity: { type: name } };
  }
  try {
    const res = await gtm.accounts.containers.workspaces.built_in_variables.create({
      parent: workspaceRef,
      type: [name],
    });
    return { action: "create", entity: { type: res.data.builtInVariable?.[0]?.type ?? name } };
  } catch (e) {
    throw new MCPError("API_UNSUPPORTED", `enableBuiltIn(${name}) failed: ${String(e)}`);
  }
}
