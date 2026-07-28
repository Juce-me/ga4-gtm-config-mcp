import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { renameMock } = vi.hoisted(() => ({
  renameMock: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  renameMock.mockImplementation(actual.rename);
  return { ...actual, rename: renameMock };
});

import {
  createUserOAuthClient,
  loadUserOAuth,
  readDesktopOAuthClient,
  readStoredUserOAuthToken,
  resolveUserOAuthPaths,
  writeStoredUserOAuthToken,
  type StoredUserOAuthToken,
} from "../src/auth/userOAuth.js";

const CLIENT_ID = "client-id-placeholder";
const OTHER_CLIENT_ID = "other-client-id-placeholder";
const CLIENT_SECRET = "client-secret-placeholder";
const REFRESH_TOKEN = "refresh-token-placeholder";
const OBTAINED_AT = "2026-07-28T12:34:56.000Z";
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/tagmanager.readonly",
];

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ga4-gtm-user-oauth-"));
  tmpDirs.push(dir);
  return dir;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

function desktopClientDocument(overrides: Record<string, unknown> = {}): object {
  return {
    installed: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      redirect_uris: ["http://localhost"],
      ...overrides,
    },
  };
}

function storedToken(overrides: Record<string, unknown> = {}): StoredUserOAuthToken {
  return {
    refresh_token: REFRESH_TOKEN,
    granted_scopes: [...SCOPES],
    client_id: CLIENT_ID,
    obtained_at: OBTAINED_AT,
    ...overrides,
  } as StoredUserOAuthToken;
}

function capturePermissionDenied(run: () => unknown): Record<string, unknown> {
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ code: "PERMISSION_DENIED" });
    return error as Record<string, unknown>;
  }
  throw new Error("Expected PERMISSION_DENIED");
}

async function captureAsyncPermissionDenied(
  run: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  try {
    await run();
  } catch (error) {
    expect(error).toMatchObject({ code: "PERMISSION_DENIED" });
    return error as Record<string, unknown>;
  }
  throw new Error("Expected PERMISSION_DENIED");
}

describe("resolveUserOAuthPaths", () => {
  it.each([
    [{ GOOGLE_OAUTH_TOKEN_PATH: "/tmp/token.json" }, "client_secrets_path_missing"],
    [
      {
        GOOGLE_OAUTH_CLIENT_SECRETS: "/tmp/client.json",
        GOOGLE_OAUTH_TOKEN_PATH: " ",
      },
      "token_path_missing",
    ],
  ])("rejects a missing or blank required environment path", (env, reason) => {
    const error = capturePermissionDenied(() => resolveUserOAuthPaths(env));

    expect(error).toMatchObject({ details: { reason } });
  });

  it.each([
    [
      {
        GOOGLE_OAUTH_CLIENT_SECRETS: "client.json",
        GOOGLE_OAUTH_TOKEN_PATH: "/tmp/token.json",
      },
      "client_secrets_path_not_absolute",
    ],
    [
      {
        GOOGLE_OAUTH_CLIENT_SECRETS: "/tmp/client.json",
        GOOGLE_OAUTH_TOKEN_PATH: "token.json",
      },
      "token_path_not_absolute",
    ],
  ])("rejects a relative environment path without disclosing it", (env, reason) => {
    const error = capturePermissionDenied(() => resolveUserOAuthPaths(env));

    expect(error).toMatchObject({ details: { reason } });
    expect(JSON.stringify(error)).not.toContain("client.json");
    expect(JSON.stringify(error)).not.toContain("token.json");
  });

  it("returns both validated absolute paths", () => {
    expect(resolveUserOAuthPaths({
      GOOGLE_OAUTH_CLIENT_SECRETS: "/configured/client.json",
      GOOGLE_OAUTH_TOKEN_PATH: "/configured/token.json",
    })).toEqual({
      clientSecretsPath: "/configured/client.json",
      tokenPath: "/configured/token.json",
    });
  });
});

describe("readDesktopOAuthClient", () => {
  it("accepts a Desktop client document and returns only its identifiers", () => {
    const path = join(makeTempDir(), "client.json");
    writeJson(path, desktopClientDocument());

    expect(readDesktopOAuthClient(path)).toEqual({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
  });

  it("rejects invalid JSON with a stable redacted reason", () => {
    const path = join(makeTempDir(), "client.json");
    writeFileSync(path, "{invalid", "utf8");

    const error = capturePermissionDenied(() => readDesktopOAuthClient(path));

    expect(error).toMatchObject({ details: { reason: "client_secrets_invalid_json" } });
    expect(JSON.stringify(error)).not.toContain(path);
  });

  it("rejects a Web-only client document", () => {
    const path = join(makeTempDir(), "client.json");
    writeJson(path, {
      web: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
    });

    const error = capturePermissionDenied(() => readDesktopOAuthClient(path));

    expect(error).toMatchObject({ details: { reason: "desktop_client_missing" } });
    expect(JSON.stringify(error)).not.toContain(CLIENT_ID);
    expect(JSON.stringify(error)).not.toContain(CLIENT_SECRET);
  });

  it.each([
    [{ client_id: " ", client_secret: CLIENT_SECRET }, "client_id_missing"],
    [{ client_id: CLIENT_ID, client_secret: "" }, "client_secret_missing"],
  ])("rejects missing or blank Desktop client identifiers", (installed, reason) => {
    const path = join(makeTempDir(), "client.json");
    writeJson(path, { installed });

    const error = capturePermissionDenied(() => readDesktopOAuthClient(path));

    expect(error).toMatchObject({ details: { reason } });
    expect(JSON.stringify(error)).not.toContain(CLIENT_ID);
    expect(JSON.stringify(error)).not.toContain(CLIENT_SECRET);
  });

  it("rejects an unreadable client secrets file", () => {
    const path = join(makeTempDir(), "client.json");
    writeJson(path, desktopClientDocument());
    chmodSync(path, 0o000);

    const error = capturePermissionDenied(() => readDesktopOAuthClient(path));

    expect(error).toMatchObject({ details: { reason: "client_secrets_unreadable" } });
    expect(JSON.stringify(error)).not.toContain(path);
  });

  it("rejects a non-regular client secrets path", () => {
    const path = makeTempDir();

    const error = capturePermissionDenied(() => readDesktopOAuthClient(path));

    expect(error).toMatchObject({ details: { reason: "client_secrets_not_regular" } });
    expect(JSON.stringify(error)).not.toContain(path);
  });
});

describe("readStoredUserOAuthToken", () => {
  it("accepts a strict stored token for the configured client", () => {
    const path = join(makeTempDir(), "token.json");
    const token = storedToken();
    writeJson(path, token);

    expect(readStoredUserOAuthToken(path, CLIENT_ID)).toEqual(token);
  });

  it.each([
    [
      {
        ...storedToken(),
        access_token: "access-token-placeholder",
      },
      "token_unknown_fields",
    ],
    [
      {
        refresh_token: REFRESH_TOKEN,
        granted_scopes: [...SCOPES],
        client_id: CLIENT_ID,
      },
      "token_missing_fields",
    ],
  ])("rejects unknown or missing token fields", (value, reason) => {
    const path = join(makeTempDir(), "token.json");
    writeJson(path, value);

    const error = capturePermissionDenied(() => readStoredUserOAuthToken(path, CLIENT_ID));

    expect(error).toMatchObject({ details: { reason } });
    expect(JSON.stringify(error)).not.toContain(REFRESH_TOKEN);
  });

  it("rejects a non-ISO obtained_at timestamp", () => {
    const path = join(makeTempDir(), "token.json");
    writeJson(path, storedToken({ obtained_at: "yesterday" }));

    const error = capturePermissionDenied(() => readStoredUserOAuthToken(path, CLIENT_ID));

    expect(error).toMatchObject({ details: { reason: "token_timestamp_invalid" } });
  });

  it.each([
    [[SCOPES[0], SCOPES[0]], "token_scopes_duplicate"],
    [[], "token_scopes_empty"],
    [[SCOPES[0], " "], "token_scope_invalid"],
  ])("rejects invalid granted scopes", (grantedScopes, reason) => {
    const path = join(makeTempDir(), "token.json");
    writeJson(path, storedToken({ granted_scopes: grantedScopes }));

    const error = capturePermissionDenied(() => readStoredUserOAuthToken(path, CLIENT_ID));

    expect(error).toMatchObject({ details: { reason } });
  });

  it("rejects a token issued to a different client without disclosing either ID", () => {
    const path = join(makeTempDir(), "token.json");
    writeJson(path, storedToken({ client_id: OTHER_CLIENT_ID }));

    const error = capturePermissionDenied(() => readStoredUserOAuthToken(path, CLIENT_ID));

    expect(error).toMatchObject({ details: { reason: "token_client_id_mismatch" } });
    expect(JSON.stringify(error)).not.toContain(CLIENT_ID);
    expect(JSON.stringify(error)).not.toContain(OTHER_CLIENT_ID);
  });

  it("rejects a symlink token path", () => {
    const dir = makeTempDir();
    const target = join(dir, "target.json");
    const path = join(dir, "token.json");
    writeJson(target, storedToken());
    symlinkSync(target, path);

    const error = capturePermissionDenied(() => readStoredUserOAuthToken(path, CLIENT_ID));

    expect(error).toMatchObject({ details: { reason: "token_not_regular" } });
  });

  it("rejects a non-regular token path", () => {
    const path = makeTempDir();

    const error = capturePermissionDenied(() => readStoredUserOAuthToken(path, CLIENT_ID));

    expect(error).toMatchObject({ details: { reason: "token_not_regular" } });
  });
});

describe("OAuth client loading", () => {
  it("sets only the refresh token on the OAuth2 client", () => {
    const auth = createUserOAuthClient(
      { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
      storedToken(),
    );

    expect(auth.credentials).toEqual({ refresh_token: REFRESH_TOKEN });
  });

  it("loads paths, the strict token, and a configured OAuth2 client", () => {
    const dir = makeTempDir();
    const clientSecretsPath = join(dir, "client.json");
    const tokenPath = join(dir, "token.json");
    writeJson(clientSecretsPath, desktopClientDocument());
    writeJson(tokenPath, storedToken());

    const loaded = loadUserOAuth({
      GOOGLE_OAUTH_CLIENT_SECRETS: clientSecretsPath,
      GOOGLE_OAUTH_TOKEN_PATH: tokenPath,
    });

    expect(loaded.token).toEqual(storedToken());
    expect(loaded.tokenPath).toBe(tokenPath);
    expect(loaded.auth.credentials).toEqual({ refresh_token: REFRESH_TOKEN });
  });
});

describe("writeStoredUserOAuthToken", () => {
  beforeEach(() => {
    renameMock.mockClear();
  });

  afterEach(() => {
    renameMock.mockClear();
  });

  it("creates a missing parent recursively with mode 0700", async () => {
    const tokenPath = join(makeTempDir(), "nested", "oauth", "token.json");

    await writeStoredUserOAuthToken(tokenPath, storedToken());

    expect(statSync(dirname(tokenPath)).mode & 0o777).toBe(0o700);
  });

  it("writes a regular final file with mode 0600", async () => {
    const tokenPath = join(makeTempDir(), "token.json");

    await writeStoredUserOAuthToken(tokenPath, storedToken());

    const status = lstatSync(tokenPath);
    expect(status.isFile()).toBe(true);
    expect(status.mode & 0o777).toBe(0o600);
  });

  it("stores only the four allowed fields with a trailing newline", async () => {
    const tokenPath = join(makeTempDir(), "token.json");
    const tokenWithProviderFields = {
      ...storedToken(),
      access_token: "access-token-placeholder",
      id_token: "id-token-placeholder",
      expiry_date: 1_800_000_000_000,
      client_secret: CLIENT_SECRET,
      code: "authorization-code-placeholder",
      code_verifier: "pkce-verifier-placeholder",
      state: "state-placeholder",
    } as StoredUserOAuthToken;

    await writeStoredUserOAuthToken(tokenPath, tokenWithProviderFields);

    const contents = readFileSync(tokenPath, "utf8");
    expect(contents.endsWith("\n")).toBe(true);
    expect(JSON.parse(contents)).toEqual(storedToken());
    expect(Object.keys(JSON.parse(contents) as object)).toEqual([
      "refresh_token",
      "granted_scopes",
      "client_id",
      "obtained_at",
    ]);
  });

  it("preserves a previous valid token when rename fails", async () => {
    const tokenPath = join(makeTempDir(), "token.json");
    const previous = storedToken({ obtained_at: "2026-07-27T12:34:56.000Z" });
    writeJson(tokenPath, previous);
    chmodSync(tokenPath, 0o600);
    renameMock.mockRejectedValueOnce(new Error("rename failed"));

    await captureAsyncPermissionDenied(() =>
      writeStoredUserOAuthToken(
        tokenPath,
        storedToken({ refresh_token: "replacement-token-placeholder" }),
      ),
    );

    expect(JSON.parse(readFileSync(tokenPath, "utf8"))).toEqual(previous);
  });

  it("cleans up its temporary file when rename fails", async () => {
    const dir = makeTempDir();
    const tokenPath = join(dir, "token.json");
    renameMock.mockRejectedValueOnce(new Error("rename failed"));

    await captureAsyncPermissionDenied(() => writeStoredUserOAuthToken(tokenPath, storedToken()));

    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses an existing symlink destination", async () => {
    const dir = makeTempDir();
    const target = join(dir, "target.json");
    const tokenPath = join(dir, "token.json");
    writeJson(target, storedToken());
    symlinkSync(target, tokenPath);

    const error = await captureAsyncPermissionDenied(() =>
      writeStoredUserOAuthToken(tokenPath, storedToken()),
    );

    expect(error).toMatchObject({ details: { reason: "token_destination_not_regular" } });
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("refuses an existing non-regular destination", async () => {
    const tokenPath = makeTempDir();

    const error = await captureAsyncPermissionDenied(() =>
      writeStoredUserOAuthToken(tokenPath, storedToken()),
    );

    expect(error).toMatchObject({ details: { reason: "token_destination_not_regular" } });
    expect(renameMock).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});
