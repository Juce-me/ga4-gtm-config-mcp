import type { analyticsadmin_v1beta } from "googleapis";
import { dataStreamName } from "./resourceNames.js";

/**
 * Returns MP secret metadata only. Drops `secretValue` from every entry as
 * defense in depth — the API does not return it on list, but stripping
 * guarantees the safety contract even if that ever changes.
 */
export async function listMetadata(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
  streamId: string,
) {
  const res = await client.properties.dataStreams.measurementProtocolSecrets.list({
    parent: dataStreamName(propertyId, streamId),
    pageSize: 200,
  });
  const items = res.data.measurementProtocolSecrets ?? [];
  return items.map(stripSecretValue);
}

/** Internal: exported only for test. */
export function stripSecretValue<T extends { secretValue?: string | null }>(item: T): Omit<T, "secretValue"> {
  const { secretValue: _omitted, ...rest } = item;
  return rest;
}
