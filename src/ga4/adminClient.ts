import { google } from "googleapis";
import type { analyticsadmin_v1beta } from "googleapis";
import { buildAuth } from "../auth/googleAuth.js";

export async function buildGa4Admin(
  mode: "read" | "write" = "read",
): Promise<analyticsadmin_v1beta.Analyticsadmin> {
  const auth = await buildAuth({ mode });
  return google.analyticsadmin({ version: "v1beta", auth });
}
