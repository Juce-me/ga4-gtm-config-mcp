import { isAbsolute } from "node:path";
import { google } from "googleapis";
import {
  READ_SCOPES,
  WRITE_WORKSPACE_SCOPES,
  VERSION_SCOPES,
  PUBLISH_SCOPES,
} from "./scopes.js";
import { MCPError } from "../utils/errors.js";

export type AuthMode = "read" | "write" | "version" | "publish";

type GoogleAuthProvider = InstanceType<typeof google.auth.GoogleAuth>;

function requiredScopes(mode: AuthMode): readonly string[] {
  if (mode === "read") return READ_SCOPES;
  if (mode === "write") return WRITE_WORKSPACE_SCOPES;
  if (mode === "version") return VERSION_SCOPES;
  return PUBLISH_SCOPES;
}

function assertAdcSelectorIsSafe(env: NodeJS.ProcessEnv = process.env): void {
  const value = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (value !== undefined && (value.trim() === "" || !isAbsolute(value))) {
    throw new Error("invalid ADC selector");
  }
}

export async function buildAuth(
  opts: { mode: AuthMode },
): Promise<GoogleAuthProvider> {
  if (opts.mode === "publish" && process.env.INCLUDE_PUBLISH_SCOPE !== "1") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Publish mode requires INCLUDE_PUBLISH_SCOPE=1.",
    );
  }

  try {
    assertAdcSelectorIsSafe();
    const googleAuth = new google.auth.GoogleAuth({
      scopes: [...requiredScopes(opts.mode)],
    });
    const resolvedClient = await googleAuth.getClient();
    const accessToken = await resolvedClient.getAccessToken();
    if (typeof accessToken.token !== "string" || accessToken.token.trim() === "") {
      throw new Error("ADC returned no access token");
    }
    return googleAuth;
  } catch {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Google Application Default Credentials are unavailable or invalid. Run the documented npm run login command or configure valid ADC.",
      { reason: "adc_unavailable" },
    );
  }
}
