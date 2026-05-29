import type { analyticsadmin_v1beta } from "googleapis";
import { stableStringify } from "../utils/stableJson.js";
import { MCPError } from "../utils/errors.js";
import type { UpsertResult } from "../gtm/upsertResult.js";
import { propertyName } from "./resourceNames.js";

export async function listKeyEvents(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
) {
  const res = await client.properties.keyEvents.list({ parent: propertyName(propertyId), pageSize: 200 });
  return res.data.keyEvents ?? [];
}

const KE_COMPARABLE = ["eventName"] as const;

export async function createKeyEvent(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
  payload: { eventName: string },
) {
  const res = await client.properties.keyEvents.create({ parent: propertyName(propertyId), requestBody: payload });
  return res.data;
}

export async function upsertKeyEvent(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
  payload: { eventName: string },
  existing?: { name?: string; eventName?: string },
): Promise<UpsertResult<unknown>> {
  if (!existing) {
    return { action: "create", entity: await createKeyEvent(client, propertyId, payload) };
  }
  const proj = (o: Record<string, unknown>) =>
    Object.fromEntries(KE_COMPARABLE.map((f) => [f, o[f] ?? null]));
  if (stableStringify(proj(existing as Record<string, unknown>)) === stableStringify(proj(payload as Record<string, unknown>))) {
    return { action: "unchanged", entity: existing };
  }
  // eventName is the immutable identity of a key event.
  // Changing it requires delete + create, which is unsupported in this model.
  throw new MCPError("API_UNSUPPORTED", `Cannot change eventName of existing key event "${existing.eventName}"`);
}
