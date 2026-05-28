import { MCPError } from "../utils/errors.js";

export const GTM_MAX_WORKSPACES = 3;

export function assertWorkspaceSafe(ws: { workspaceId: string; name: string }): void {
  if (ws.workspaceId === "0" || ws.name === "Default Workspace") {
    throw new MCPError(
      "WORKSPACE_UNSAFE",
      `WORKSPACE_UNSAFE: Refusing to operate on the live/default workspace (id=${ws.workspaceId}, name=${ws.name})`,
    );
  }
}

export interface CapacityResult {
  ok: boolean;
  code?: "WORKSPACE_CAPACITY_BLOCKED";
  message?: string;
}

export function checkCapacity(input: { existingWorkspaces: number; maxWorkspaces?: number }): CapacityResult {
  const max = input.maxWorkspaces ?? GTM_MAX_WORKSPACES;
  if (input.existingWorkspaces >= max) {
    return {
      ok: false,
      code: "WORKSPACE_CAPACITY_BLOCKED",
      message: `GTM container has ${input.existingWorkspaces}/${max} workspaces. Delete or merge one before creating another.`,
    };
  }
  return { ok: true };
}
