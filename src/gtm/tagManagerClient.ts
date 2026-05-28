import { google, type tagmanager_v2 } from "googleapis";
import { buildAuth } from "../auth/googleAuth.js";

export async function buildGtm(
  mode: "read" | "write" | "publish" = "read",
): Promise<tagmanager_v2.Tagmanager> {
  const auth = await buildAuth({ mode });
  return google.tagmanager({ version: "v2", auth });
}
