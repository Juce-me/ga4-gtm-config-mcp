import type { tagmanager_v2 } from "googleapis";
import { MCPError } from "../utils/errors.js";

/**
 * Publishes a GTM container version. Refuses if INCLUDE_PUBLISH_SCOPE !== "1".
 *
 * This is a SECOND defense layer on top of buildAuth's scope-construction
 * gate. The MCP tool wrapper in M7 adds the per-call approval token gate.
 */
export async function publishVersion(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  versionId: string,
) {
  if (process.env.INCLUDE_PUBLISH_SCOPE !== "1") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "publishVersion refuses to run unless INCLUDE_PUBLISH_SCOPE=1 is set in env.",
    );
  }
  const res = await gtm.accounts.containers.versions.publish({
    path: `accounts/${accountId}/containers/${containerId}/versions/${versionId}`,
  });
  return res.data;
}
