import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MCPError } from "../src/utils/errors.js";
import {
  READ_SCOPES,
  WRITE_WORKSPACE_SCOPES,
  VERSION_SCOPES,
  PUBLISH_SCOPES,
} from "../src/auth/scopes.js";
import * as scopes from "../src/auth/scopes.js";

const { loadUserOAuthMock } = vi.hoisted(() => ({
  loadUserOAuthMock: vi.fn(),
}));

vi.mock("../src/auth/userOAuth.js", () => ({
  loadUserOAuth: loadUserOAuthMock,
}));

import { buildAuth, type AuthMode } from "../src/auth/googleAuth.js";

const READ_MODE_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

const WRITE_MODE_SCOPES = [
  ...READ_MODE_SCOPES,
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/analytics.edit",
] as const;

const VERSION_MODE_SCOPES = [
  ...READ_MODE_SCOPES,
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
] as const;

const PUBLISH_MODE_SCOPES = [
  ...WRITE_MODE_SCOPES,
  "https://www.googleapis.com/auth/tagmanager.publish",
] as const;

const MODE_SCOPES: Record<AuthMode, readonly string[]> = {
  read: READ_MODE_SCOPES,
  write: WRITE_MODE_SCOPES,
  version: VERSION_MODE_SCOPES,
  publish: PUBLISH_MODE_SCOPES,
};

function arrangeLoadedOAuth(
  grantedScopes: readonly string[],
  getAccessToken = vi.fn().mockResolvedValue({ token: "access-token-placeholder" }),
) {
  const auth = { getAccessToken };
  const token = {
    refresh_token: "refresh-token-placeholder",
    granted_scopes: [...grantedScopes],
    client_id: "client-id-placeholder",
    obtained_at: "2026-07-28T12:34:56.000Z",
  };
  loadUserOAuthMock.mockReturnValue({
    auth,
    token,
    tokenPath: "/configured/token.json",
  });
  return { auth, getAccessToken, token };
}

async function capturePermissionDenied(
  run: () => Promise<unknown>,
): Promise<MCPError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(MCPError);
    expect(error).toMatchObject({ code: "PERMISSION_DENIED" });
    return error as MCPError;
  }
  throw new Error("Expected PERMISSION_DENIED");
}

describe("auth scopes", () => {
  it("READ_SCOPES contains tag manager + analytics read", () => {
    expect(READ_SCOPES).toContain("https://www.googleapis.com/auth/tagmanager.readonly");
    expect(READ_SCOPES).toContain("https://www.googleapis.com/auth/analytics.readonly");
  });

  it("WRITE_WORKSPACE_SCOPES is a superset of READ_SCOPES + adds edit scopes", () => {
    for (const s of READ_SCOPES) expect(WRITE_WORKSPACE_SCOPES).toContain(s);
    expect(WRITE_WORKSPACE_SCOPES).toContain("https://www.googleapis.com/auth/tagmanager.edit.containers");
    expect(WRITE_WORKSPACE_SCOPES).toContain("https://www.googleapis.com/auth/analytics.edit");
    expect(WRITE_WORKSPACE_SCOPES).not.toContain("https://www.googleapis.com/auth/tagmanager.edit.containerversions");
  });

  it("VERSION_SCOPES is a superset of READ_SCOPES + adds container-version edit only", () => {
    for (const s of READ_SCOPES) expect(VERSION_SCOPES).toContain(s);
    expect(VERSION_SCOPES).toContain("https://www.googleapis.com/auth/tagmanager.edit.containerversions");
    expect(VERSION_SCOPES).not.toContain("https://www.googleapis.com/auth/tagmanager.edit.containers");
    expect(VERSION_SCOPES).not.toContain("https://www.googleapis.com/auth/tagmanager.publish");
  });

  it("PUBLISH_SCOPES is a superset of WRITE_WORKSPACE_SCOPES + adds publish scope", () => {
    for (const s of WRITE_WORKSPACE_SCOPES) expect(PUBLISH_SCOPES).toContain(s);
    expect(PUBLISH_SCOPES).toContain("https://www.googleapis.com/auth/tagmanager.publish");
  });

  it("ALL_LOGIN_SCOPES combines every operational scope without user-management grants", () => {
    const allLoginScopes = (scopes as Record<string, readonly string[]>).ALL_LOGIN_SCOPES ?? [];

    for (const scopeSet of [READ_SCOPES, WRITE_WORKSPACE_SCOPES, VERSION_SCOPES, PUBLISH_SCOPES]) {
      for (const scope of scopeSet) expect(allLoginScopes).toContain(scope);
    }

    expect(new Set(allLoginScopes).size).toBe(allLoginScopes.length);
    expect(allLoginScopes).not.toContain("https://www.googleapis.com/auth/analytics.manage.users");
    expect(allLoginScopes).not.toContain("https://www.googleapis.com/auth/tagmanager.manage.users");
  });
});

describe("buildAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(Object.entries(MODE_SCOPES))(
    "returns the loaded OAuth2 client when %s mode has exactly its required stored grants",
    async (mode, requiredScopes) => {
      if (mode === "publish") vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");
      const { auth, getAccessToken } = arrangeLoadedOAuth(requiredScopes);

      await expect(buildAuth({ mode: mode as AuthMode })).resolves.toBe(auth);

      expect(loadUserOAuthMock).toHaveBeenCalledOnce();
      expect(getAccessToken).toHaveBeenCalledOnce();
    },
  );

  it("rejects publish mode before loading OAuth when INCLUDE_PUBLISH_SCOPE is absent", async () => {
    arrangeLoadedOAuth(PUBLISH_MODE_SCOPES);

    await expect(buildAuth({ mode: "publish" })).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Publish mode requires INCLUDE_PUBLISH_SCOPE=1.",
    });
    expect(loadUserOAuthMock).not.toHaveBeenCalled();
  });

  it("uses INCLUDE_PUBLISH_SCOPE only as a publish-mode gate and does not change stored grants", async () => {
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");
    const { auth, token } = arrangeLoadedOAuth(PUBLISH_MODE_SCOPES);
    const originalGrants = [...token.granted_scopes];

    await expect(buildAuth({ mode: "publish" })).resolves.toBe(auth);

    expect(token.granted_scopes).toEqual(originalGrants);
  });

  it.each([
    ["read", READ_MODE_SCOPES.slice(0, -1)],
    ["write", WRITE_MODE_SCOPES.slice(0, -1)],
    ["version", VERSION_MODE_SCOPES.slice(0, -1)],
    ["publish", PUBLISH_MODE_SCOPES.slice(0, -1)],
  ] satisfies [AuthMode, readonly string[]][])(
    "rejects a partial stored grant for %s mode before refreshing",
    async (mode, partialGrant) => {
      if (mode === "publish") vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");
      const { getAccessToken } = arrangeLoadedOAuth(partialGrant);

      const error = await capturePermissionDenied(() => buildAuth({ mode }));

      expect(error.message).toContain("npm run login");
      expect(error.details).toEqual({ reason: "missing_required_scopes" });
      expect(getAccessToken).not.toHaveBeenCalled();
    },
  );

  it("still requires the stored publish grant when INCLUDE_PUBLISH_SCOPE=1", async () => {
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");
    const { getAccessToken } = arrangeLoadedOAuth(WRITE_MODE_SCOPES);

    const error = await capturePermissionDenied(() => buildAuth({ mode: "publish" }));

    expect(error.message).toContain("npm run login");
    expect(error.details).toEqual({ reason: "missing_required_scopes" });
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("awaits exactly one access-token refresh before returning the OAuth2 client", async () => {
    let completeRefresh!: () => void;
    const refresh = new Promise<{ token: string }>((resolve) => {
      completeRefresh = () => resolve({ token: "access-token-placeholder" });
    });
    const getAccessToken = vi.fn().mockReturnValue(refresh);
    const { auth } = arrangeLoadedOAuth(READ_MODE_SCOPES, getAccessToken);
    let returned = false;

    const pendingAuth = buildAuth({ mode: "read" }).then((result) => {
      returned = true;
      return result;
    });
    await Promise.resolve();

    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(returned).toBe(false);

    completeRefresh();
    await expect(pendingAuth).resolves.toBe(auth);
    expect(getAccessToken).toHaveBeenCalledOnce();
  });

  it("translates invalid_grant without serializing provider values", async () => {
    const providerValues = [
      "provider-message-placeholder",
      "provider-description-placeholder",
      "authorization-code-placeholder",
      "client-secret-placeholder",
      "https://oauth2.googleapis.test/token?raw-provider-query",
    ];
    const providerError = Object.assign(new Error(providerValues[0]), {
      response: {
        data: {
          error: "invalid_grant",
          error_description: providerValues[1],
          authorization_code: providerValues[2],
          client_secret: providerValues[3],
        },
      },
      config: { url: providerValues[4] },
    });
    arrangeLoadedOAuth(
      READ_MODE_SCOPES,
      vi.fn().mockRejectedValue(providerError),
    );

    const error = await capturePermissionDenied(() => buildAuth({ mode: "read" }));
    const serialized = JSON.stringify(error.toJSON());

    expect(error).toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Google OAuth authorization expired or was revoked. Run npm run login.",
      details: {},
    });
    for (const value of providerValues) expect(serialized).not.toContain(value);
  });

  it("redacts generic refresh failures to a stable reason", async () => {
    const providerValues = [
      "provider-message-placeholder",
      "provider-description-placeholder",
      "refresh-token-placeholder",
      "https://oauth2.googleapis.test/token?raw-provider-query",
    ];
    const providerError = Object.assign(new Error(providerValues[0]), {
      response: {
        data: {
          error: "temporarily_unavailable",
          error_description: providerValues[1],
          refresh_token: providerValues[2],
        },
      },
      config: { url: providerValues[3] },
    });
    arrangeLoadedOAuth(
      READ_MODE_SCOPES,
      vi.fn().mockRejectedValue(providerError),
    );

    const error = await capturePermissionDenied(() => buildAuth({ mode: "read" }));
    const serialized = JSON.stringify(error.toJSON());

    expect(error).toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Google OAuth token refresh failed. Run npm run login.",
      details: { reason: "oauth_refresh_failed" },
    });
    for (const value of providerValues) expect(serialized).not.toContain(value);
  });
});
