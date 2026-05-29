import type { tagmanager_v2 } from "googleapis";
import { MCPError } from "../utils/errors.js";
import { versionPath, workspaceId as normalizeWorkspaceId } from "./idPaths.js";

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
  if (normalizeWorkspaceId(workspaceId) === "0") {
    throw new MCPError(
      "WORKSPACE_UNSAFE",
      "Cannot create a version from the live/default workspace",
    );
  }
  const res = await gtm.accounts.containers.workspaces.create_version({
    path: versionPath(accountId, containerId, workspaceId),
    requestBody: { name, notes },
  });
  return res.data;
}
