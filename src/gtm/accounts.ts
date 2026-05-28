import type { tagmanager_v2 } from "googleapis";

export async function listAccounts(gtm: tagmanager_v2.Tagmanager) {
  const res = await gtm.accounts.list({});
  return res.data.account ?? [];
}

export async function getAccount(gtm: tagmanager_v2.Tagmanager, accountId: string) {
  const res = await gtm.accounts.get({ path: `accounts/${accountId}` });
  return res.data;
}
