import type { analyticsadmin_v1beta } from "googleapis";
import { stableStringify } from "../utils/stableJson.js";
import { MCPError } from "../utils/errors.js";
import type { UpsertResult } from "../gtm/upsertResult.js";
import { propertyName } from "./resourceNames.js";

export async function listCustomMetrics(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
) {
  const res = await client.properties.customMetrics.list({ parent: propertyName(propertyId), pageSize: 200 });
  return res.data.customMetrics ?? [];
}

const CM_COMPARABLE = ["parameterName", "displayName", "scope", "measurementUnit", "description"] as const;

type CustomMetricPayload = {
  parameterName: string;
  displayName: string;
  scope: "EVENT";
  measurementUnit: string;
  description?: string;
};

type ExistingCustomMetric = {
  name?: string;
  parameterName?: string;
  displayName?: string;
  scope?: string;
  measurementUnit?: string;
  description?: string;
};

export async function createCustomMetric(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
  payload: CustomMetricPayload,
) {
  const res = await client.properties.customMetrics.create({ parent: propertyName(propertyId), requestBody: payload });
  return res.data;
}

export async function updateCustomMetric(
  client: analyticsadmin_v1beta.Analyticsadmin,
  name: string,
  payload: { displayName?: string; description?: string },
) {
  // GA Admin v1beta: parameterName, scope, and measurementUnit cannot be updated after create.
  const res = await client.properties.customMetrics.patch({
    name,
    updateMask: Object.keys(payload).join(","),
    requestBody: payload,
  });
  return res.data;
}

export async function upsertCustomMetric(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
  payload: CustomMetricPayload,
  existing?: ExistingCustomMetric,
): Promise<UpsertResult<unknown>> {
  if (!existing) {
    return { action: "create", entity: await createCustomMetric(client, propertyId, payload) };
  }
  const proj = (o: Record<string, unknown>) =>
    Object.fromEntries(CM_COMPARABLE.map((f) => [f, o[f] ?? null]));
  if (stableStringify(proj(existing as Record<string, unknown>)) === stableStringify(proj(payload as Record<string, unknown>))) {
    return { action: "unchanged", entity: existing };
  }
  if (existing.parameterName !== payload.parameterName || existing.scope !== payload.scope || existing.measurementUnit !== payload.measurementUnit) {
    throw new MCPError("API_UNSUPPORTED", `Cannot change parameterName, scope, or measurementUnit of existing CM "${existing.parameterName}"`);
  }
  if (!existing.name) throw new MCPError("API_UNSUPPORTED", "existing CM missing resource name");
  return { action: "update", entity: await updateCustomMetric(client, existing.name, { displayName: payload.displayName, description: payload.description }) };
}
