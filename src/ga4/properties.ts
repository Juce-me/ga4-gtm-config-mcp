import type { analyticsadmin_v1beta } from "googleapis";

export async function readProperty(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
) {
  const res = await client.properties.get({ name: propertyId });
  return res.data;
}
