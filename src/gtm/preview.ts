import type { tagmanager_v2 } from "googleapis";

/**
 * Returns the workspace metadata + a fixed manual validation checklist.
 * Does NOT create a container version. Does NOT publish.
 *
 * The MCP tool layer (M7) returns this checklist string verbatim because the
 * GTM v2 API does not expose a preview URL/token in a stable way — surfacing
 * a fabricated link would be worse than telling the operator exactly what to
 * check by hand.
 */
export async function getPreviewInfo(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  workspaceId: string,
) {
  const res = await gtm.accounts.containers.workspaces.get({
    path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  return {
    workspace: res.data,
    manualChecklist: manualValidationChecklist(),
  };
}

export function manualValidationChecklist(): string[] {
  return [
    "Open Tag Assistant Companion in Chrome and enter the GTM container ID.",
    "Trigger the userevent pageview from the staging page and verify GA4 - Page View fires.",
    "Trigger one userevent event per approved event_name and verify GA4 - User Event fires with the right params.",
    "In GA4 DebugView, confirm each event arrives with the expected parameters and no PII.",
    "If ecommerce is enabled, validate at least one ecommerce event end-to-end.",
  ];
}
