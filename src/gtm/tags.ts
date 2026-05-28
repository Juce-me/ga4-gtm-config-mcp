import type { tagmanager_v2 } from "googleapis";
import { MCPError } from "../utils/errors.js";
import type { UpsertResult } from "./upsertResult.js";
import { gtmEntityMatches } from "./upsertResult.js";

export async function listTags(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  workspaceId: string,
) {
  const res = await gtm.accounts.containers.workspaces.tags.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  return res.data.tag ?? [];
}

export async function createTag(
  gtm: tagmanager_v2.Tagmanager,
  workspaceRef: string,
  payload: Record<string, unknown>,
) {
  const res = await gtm.accounts.containers.workspaces.tags.create({
    parent: workspaceRef,
    requestBody: payload as unknown as tagmanager_v2.Schema$Tag,
  });
  return res.data;
}

export async function updateTag(
  gtm: tagmanager_v2.Tagmanager,
  path: string,
  payload: Record<string, unknown>,
) {
  const res = await gtm.accounts.containers.workspaces.tags.update({
    path,
    requestBody: payload as unknown as tagmanager_v2.Schema$Tag,
  });
  return res.data;
}

export async function upsertTag(
  gtm: tagmanager_v2.Tagmanager,
  workspaceRef: string,
  payload: Record<string, unknown>,
  existing?: tagmanager_v2.Schema$Tag & { path?: string },
): Promise<UpsertResult<tagmanager_v2.Schema$Tag>> {
  if (!existing) {
    return { action: "create", entity: await createTag(gtm, workspaceRef, payload) };
  }
  if (gtmEntityMatches("tag", existing as Record<string, unknown>, payload)) {
    return { action: "unchanged", entity: existing };
  }
  const pathStr = existing.path ?? (() => {
    const id = existing.tagId;
    if (!id) throw new MCPError("API_UNSUPPORTED", "existing tag has no tagId; cannot update");
    return `${workspaceRef}/tags/${id}`;
  })();
  return { action: "update", entity: await updateTag(gtm, pathStr, payload) };
}
