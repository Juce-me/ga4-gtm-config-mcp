import type { tagmanager_v2 } from "googleapis";
import { checkCapacity, GTM_MAX_WORKSPACES } from "../safety/workspaceGuards.js";
import { containerPath } from "./idPaths.js";

export async function listWorkspaces(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
) {
  const res = await gtm.accounts.containers.workspaces.list({
    parent: containerPath(accountId, containerId),
  });
  return res.data.workspace ?? [];
}

export async function workspaceCapacity(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
) {
  const list = await listWorkspaces(gtm, accountId, containerId);
  const gate = checkCapacity({ existingWorkspaces: list.length, maxWorkspaces: GTM_MAX_WORKSPACES });
  return {
    existing: list.length,
    max: GTM_MAX_WORKSPACES,
    freeSlots: GTM_MAX_WORKSPACES - list.length,
    capacityOk: gate.ok,
  };
}

export async function findByName(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  name: string,
) {
  const list = await listWorkspaces(gtm, accountId, containerId);
  return list.find((w) => w.name === name);
}

export async function createWorkspace(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  name: string,
) {
  const res = await gtm.accounts.containers.workspaces.create({
    parent: containerPath(accountId, containerId),
    requestBody: { name, description: "Created by ga4-gtm-config-mcp" },
  });
  return res.data;
}
