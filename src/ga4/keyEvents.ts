import type { analyticsadmin_v1beta } from "googleapis";

export async function listKeyEvents(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
) {
  const res = await client.properties.keyEvents.list({ parent: propertyId, pageSize: 200 });
  return res.data.keyEvents ?? [];
}
