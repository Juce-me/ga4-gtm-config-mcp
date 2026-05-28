import type { tagmanager_v2 } from "googleapis";

export async function listContainers(gtm: tagmanager_v2.Tagmanager, accountId: string) {
  const res = await gtm.accounts.containers.list({ parent: `accounts/${accountId}` });
  return res.data.container ?? [];
}

export async function getContainer(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
) {
  const res = await gtm.accounts.containers.get({
    path: `accounts/${accountId}/containers/${containerId}`,
  });
  return res.data;
}
