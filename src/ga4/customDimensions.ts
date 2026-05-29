import type { analyticsadmin_v1beta } from "googleapis";
import { stableStringify } from "../utils/stableJson.js";
import { MCPError } from "../utils/errors.js";
import type { UpsertResult } from "../gtm/upsertResult.js";
import { propertyName } from "./resourceNames.js";

export async function listCustomDimensions(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
) {
  const res = await client.properties.customDimensions.list({ parent: propertyName(propertyId), pageSize: 200 });
  return res.data.customDimensions ?? [];
}

const CD_COMPARABLE = ["parameterName", "displayName", "scope", "description"] as const;

export async function createCustomDimension(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
  payload: { parameterName: string; displayName: string; scope: "EVENT" | "USER" | "ITEM"; description?: string },
) {
  const res = await client.properties.customDimensions.create({ parent: propertyName(propertyId), requestBody: payload });
  return res.data;
}

export async function updateCustomDimension(
  client: analyticsadmin_v1beta.Analyticsadmin,
  name: string,
  payload: { displayName?: string; description?: string },
) {
  // GA Admin v1beta: parameterName and scope cannot be updated after create.
  const res = await client.properties.customDimensions.patch({
    name,
    updateMask: Object.keys(payload).join(","),
    requestBody: payload,
  });
  return res.data;
}

export async function upsertCustomDimension(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
  payload: { parameterName: string; displayName: string; scope: "EVENT" | "USER" | "ITEM"; description?: string },
  existing?: { name?: string; parameterName?: string; displayName?: string; scope?: string; description?: string },
): Promise<UpsertResult<unknown>> {
  if (!existing) {
    return { action: "create", entity: await createCustomDimension(client, propertyId, payload) };
  }
  const proj = (o: Record<string, unknown>) =>
    Object.fromEntries(CD_COMPARABLE.map((f) => [f, o[f] ?? null]));
  if (stableStringify(proj(existing as Record<string, unknown>)) === stableStringify(proj(payload as Record<string, unknown>))) {
    return { action: "unchanged", entity: existing };
  }
  if (existing.parameterName !== payload.parameterName || existing.scope !== payload.scope) {
    throw new MCPError("API_UNSUPPORTED", `Cannot change parameterName or scope of existing CD "${existing.parameterName}"`);
  }
  if (!existing.name) throw new MCPError("API_UNSUPPORTED", "existing CD missing resource name");
  return { action: "update", entity: await updateCustomDimension(client, existing.name, { displayName: payload.displayName, description: payload.description }) };
}
