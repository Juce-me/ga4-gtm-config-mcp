import type { analyticsadmin_v1beta } from "googleapis";

export async function listCustomMetrics(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
) {
  const res = await client.properties.customMetrics.list({ parent: propertyId, pageSize: 200 });
  return res.data.customMetrics ?? [];
}
