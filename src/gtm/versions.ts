import type { tagmanager_v2 } from "googleapis";
import { MCPError } from "../utils/errors.js";

// IMPORTANT: workspaces.create_version REMOVES the workspace from the container.
// Never call from dry-run paths. Only invoke via tools/versionTools.ts after the gate passes.
export async function createVersion(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  workspaceId: string,
  name: string,
  notes?: string,
) {
  if (workspaceId === "0") {
    throw new MCPError(
      "WORKSPACE_UNSAFE",
      "Cannot create a version from the live/default workspace",
    );
  }
  const res = await gtm.accounts.containers.workspaces.create_version({
    path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
    requestBody: { name, notes },
  });
  return res.data;
}
