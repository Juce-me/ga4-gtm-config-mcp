import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MCPError } from "../src/utils/errors.js";
import {
  READ_SCOPES,
  WRITE_WORKSPACE_SCOPES,
  VERSION_SCOPES,
  PUBLISH_SCOPES,
} from "../src/auth/scopes.js";
import * as scopes from "../src/auth/scopes.js";

const {
  googleAuthConstructorMock,
  getClientMock,
  getAccessTokenMock,
} = vi.hoisted(() => ({
  googleAuthConstructorMock: vi.fn(),
  getClientMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: googleAuthConstructorMock,
    },
  },
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

const EXPECTED_OPERATIONAL_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
] as const;

const MODE_SCOPES: Record<AuthMode, readonly string[]> = {
  read: READ_MODE_SCOPES,
  write: WRITE_MODE_SCOPES,
  version: VERSION_MODE_SCOPES,
  publish: PUBLISH_MODE_SCOPES,
};

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

  it("ALL_LOGIN_SCOPES equals the exact independent operational-scope set", () => {
    const allLoginScopes = scopes.ALL_LOGIN_SCOPES;

    expect(new Set(allLoginScopes)).toEqual(new Set(EXPECTED_OPERATIONAL_SCOPES));
    expect(allLoginScopes).toHaveLength(EXPECTED_OPERATIONAL_SCOPES.length);
  });
});

describe("buildAuth", () => {
  const authClient = { getAccessToken: getAccessTokenMock };
  const googleAuthProvider = { getClient: getClientMock };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", undefined);
    getAccessTokenMock.mockResolvedValue({ token: "access-token-placeholder" });
    getClientMock.mockResolvedValue(authClient);
    googleAuthConstructorMock.mockImplementation(() => googleAuthProvider);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(Object.entries(MODE_SCOPES))(
    "constructs ADC with exactly the %s mode scopes and validates one token",
    async (mode, requiredScopes) => {
      if (mode === "publish") vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");

      await expect(buildAuth({ mode: mode as AuthMode })).resolves.toBe(
        googleAuthProvider,
      );

      expect(googleAuthConstructorMock).toHaveBeenCalledOnce();
      expect(googleAuthConstructorMock).toHaveBeenCalledWith({
        scopes: [...requiredScopes],
      });
      expect(getClientMock).toHaveBeenCalledOnce();
      expect(getAccessTokenMock).toHaveBeenCalledOnce();
    },
  );

  it("waits for access-token validation before returning the GoogleAuth provider", async () => {
    let finish!: () => void;
    getAccessTokenMock.mockReturnValue(new Promise((resolve) => {
      finish = () => resolve({ token: "access-token-placeholder" });
    }));
    let returned = false;

    const pending = buildAuth({ mode: "read" }).then((auth) => {
      returned = true;
      return auth;
    });
    await Promise.resolve();

    expect(returned).toBe(false);
    finish();
    await expect(pending).resolves.toBe(googleAuthProvider);
  });

  it("uses standard ADC discovery when GOOGLE_APPLICATION_CREDENTIALS is unset", async () => {
    await expect(buildAuth({ mode: "read" })).resolves.toBe(googleAuthProvider);
    expect(googleAuthConstructorMock).toHaveBeenCalledOnce();
  });

  it.each(["", "   ", "relative/adc.json"])(
    "rejects an invalid GOOGLE_APPLICATION_CREDENTIALS value without exposing it: %j",
    async (credentialPath) => {
      vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", credentialPath);

      const error = await capturePermissionDenied(() => buildAuth({ mode: "read" }));
      expect(error).toMatchObject({
        code: "PERMISSION_DENIED",
        details: { reason: "adc_unavailable" },
      });
      const serialized = JSON.stringify(error.toJSON());
      if (credentialPath.trim()) {
        expect(serialized).not.toContain(credentialPath.trim());
      } else {
        expect(serialized).not.toContain("GOOGLE_APPLICATION_CREDENTIALS");
        expect(serialized).not.toContain("path");
      }
      expect(googleAuthConstructorMock).not.toHaveBeenCalled();
    },
  );

  it("accepts an absolute GOOGLE_APPLICATION_CREDENTIALS selector", async () => {
    vi.stubEnv(
      "GOOGLE_APPLICATION_CREDENTIALS",
      "/absolute/path/to/private/application-default-credentials.json",
    );

    await expect(buildAuth({ mode: "read" })).resolves.toBe(googleAuthProvider);
  });

  it("rejects publish mode before ADC discovery when INCLUDE_PUBLISH_SCOPE is absent", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "relative/adc.json");

    await expect(buildAuth({ mode: "publish" })).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Publish mode requires INCLUDE_PUBLISH_SCOPE=1.",
    });
    expect(googleAuthConstructorMock).not.toHaveBeenCalled();
    expect(getClientMock).not.toHaveBeenCalled();
  });

  const providerValues = [
    "provider-message-placeholder",
    "refresh-token-placeholder",
    "client-secret-placeholder",
    "https://oauth2.googleapis.test/token?raw-provider-query",
  ];
  const providerError = Object.assign(new Error(providerValues[0]), {
    response: { data: { refresh_token: providerValues[1] } },
    client_secret: providerValues[2],
    config: { url: providerValues[3] },
  });

  it.each([
    ["credential discovery", () => getClientMock.mockRejectedValue(providerError)],
    ["token acquisition", () => getAccessTokenMock.mockRejectedValue(providerError)],
  ] as const)("redacts provider values from %s failures", async (_label, arrange) => {
    arrange();

    const error = await capturePermissionDenied(() => buildAuth({ mode: "read" }));
    const serialized = JSON.stringify(error.toJSON());

    expect(error).toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Google Application Default Credentials are unavailable or invalid. Run the documented npm run login command or configure valid ADC.",
      details: { reason: "adc_unavailable" },
    });
    for (const value of providerValues) expect(serialized).not.toContain(value);
  });

  it.each([undefined, null, "", "   "])(
    "rejects an unusable access-token result: %j",
    async (token) => {
      getAccessTokenMock.mockResolvedValue({ token });

      const error = await capturePermissionDenied(() => buildAuth({ mode: "read" }));
      expect(error).toMatchObject({
        code: "PERMISSION_DENIED",
        details: { reason: "adc_unavailable" },
      });
    },
  );
});
