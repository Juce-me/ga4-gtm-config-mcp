import type { analyticsadmin_v1beta } from "googleapis";

export async function listCustomDimensions(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
) {
  const res = await client.properties.customDimensions.list({ parent: propertyId, pageSize: 200 });
  return res.data.customDimensions ?? [];
}
