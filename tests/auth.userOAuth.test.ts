import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
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

const {
  chmodAsyncMock,
  lstatAsyncMock,
  mkdirSyncMock,
  openAsyncMock,
  openSyncMock,
  readFileSyncMock,
  renameMock,
} = vi.hoisted(() => ({
  chmodAsyncMock: vi.fn(),
  lstatAsyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  openAsyncMock: vi.fn(),
  openSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  renameMock: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  mkdirSyncMock.mockImplementation(actual.mkdirSync);
  openSyncMock.mockImplementation(actual.openSync);
  readFileSyncMock.mockImplementation(actual.readFileSync);
  return {
    ...actual,
    mkdirSync: mkdirSyncMock,
    openSync: openSyncMock,
    readFileSync: readFileSyncMock,
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  chmodAsyncMock.mockImplementation(actual.chmod);
  lstatAsyncMock.mockImplementation(actual.lstat);
  openAsyncMock.mockImplementation(actual.open);
  renameMock.mockImplementation(actual.rename);
  return {
    ...actual,
    chmod: chmodAsyncMock,
    lstat: lstatAsyncMock,
    open: openAsyncMock,
    rename: renameMock,
  };
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

  it.each([
    ["the exact same path", (path: string) => path],
    ["a normalized lexical alias", (path: string) => `${dirname(path)}/unused/../client.json`],
  ])("rejects %s for client secrets and token storage", (_name, tokenPathFor) => {
    const clientSecretsPath = join(makeTempDir(), "client.json");
    const tokenPath = tokenPathFor(clientSecretsPath);

    const error = capturePermissionDenied(() => resolveUserOAuthPaths({
      GOOGLE_OAUTH_CLIENT_SECRETS: clientSecretsPath,
      GOOGLE_OAUTH_TOKEN_PATH: tokenPath,
    }));

    expect(error).toMatchObject({ details: { reason: "oauth_paths_not_distinct" } });
    expect(JSON.stringify(error)).not.toContain(clientSecretsPath);
  });

  it("rejects existing hard-linked client and token paths", () => {
    const dir = makeTempDir();
    const clientSecretsPath = join(dir, "client.json");
    const tokenPath = join(dir, "token.json");
    writeJson(clientSecretsPath, desktopClientDocument());
    linkSync(clientSecretsPath, tokenPath);

    const error = capturePermissionDenied(() => resolveUserOAuthPaths({
      GOOGLE_OAUTH_CLIENT_SECRETS: clientSecretsPath,
      GOOGLE_OAUTH_TOKEN_PATH: tokenPath,
    }));

    expect(error).toMatchObject({ details: { reason: "oauth_paths_not_distinct" } });
  });

  it("rejects parent-symlink aliases that resolve to the same destination", () => {
    const root = makeTempDir();
    const realParent = join(root, "real");
    const aliasedParent = join(root, "alias");
    mkdirSync(realParent, { mode: 0o700 });
    symlinkSync(realParent, aliasedParent, "dir");
    const clientSecretsPath = join(realParent, "client.json");
    const tokenPath = join(aliasedParent, "client.json");
    writeJson(clientSecretsPath, desktopClientDocument());

    const error = capturePermissionDenied(() => resolveUserOAuthPaths({
      GOOGLE_OAUTH_CLIENT_SECRETS: clientSecretsPath,
      GOOGLE_OAUTH_TOKEN_PATH: tokenPath,
    }));

    expect(error).toMatchObject({ details: { reason: "oauth_paths_not_distinct" } });
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

  it("rejects a client secrets file when opening it is denied", () => {
    const path = join(makeTempDir(), "client.json");
    writeJson(path, desktopClientDocument());
    openSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error("open denied"), { code: "EACCES" });
    });

    const error = capturePermissionDenied(() => readDesktopOAuthClient(path));

    expect(error).toMatchObject({ details: { reason: "client_secrets_unreadable" } });
    expect(JSON.stringify(error)).not.toContain(path);
  });

  it("reads the opened file when its pathname is concurrently replaced by a symlink", async () => {
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const dir = makeTempDir();
    const path = join(dir, "client.json");
    const replacement = join(dir, "replacement.json");
    writeJson(path, desktopClientDocument());
    writeJson(replacement, desktopClientDocument({
      client_id: OTHER_CLIENT_ID,
      client_secret: "other-client-secret-placeholder",
    }));
    readFileSyncMock.mockImplementationOnce((pathOrDescriptor, options) => {
      rmSync(path);
      symlinkSync(replacement, path);
      return actualFs.readFileSync(pathOrDescriptor, options);
    });

    expect(readDesktopOAuthClient(path)).toEqual({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
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

  it("rejects colliding credential inodes before runtime token parsing", () => {
    const dir = makeTempDir();
    const clientSecretsPath = join(dir, "client.json");
    const tokenPath = join(dir, "token.json");
    writeJson(clientSecretsPath, desktopClientDocument());
    linkSync(clientSecretsPath, tokenPath);

    const error = capturePermissionDenied(() => loadUserOAuth({
      GOOGLE_OAUTH_CLIENT_SECRETS: clientSecretsPath,
      GOOGLE_OAUTH_TOKEN_PATH: tokenPath,
    }));

    expect(error).toMatchObject({ details: { reason: "oauth_paths_not_distinct" } });
    expect(JSON.stringify(error)).not.toContain(CLIENT_ID);
    expect(JSON.stringify(error)).not.toContain(CLIENT_SECRET);
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

  it("sets every newly created parent component to 0700 under a restrictive umask", async () => {
    const root = makeTempDir();
    const firstParent = join(root, "nested");
    const finalParent = join(firstParent, "oauth");
    const tokenPath = join(finalParent, "token.json");
    const previousUmask = process.umask(0o777);
    try {
      await writeStoredUserOAuthToken(tokenPath, storedToken());
      expect(statSync(firstParent).mode & 0o777).toBe(0o700);
      expect(statSync(finalParent).mode & 0o777).toBe(0o700);
    } finally {
      process.umask(previousUmask);
      if (existsSync(firstParent)) chmodSync(firstParent, 0o700);
      if (existsSync(finalParent)) chmodSync(finalParent, 0o700);
    }
  });

  it("avoids the umask getter while preserving group and world masking", async () => {
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const root = makeTempDir();
    const parent = join(root, "oauth");
    const tokenPath = join(parent, "token.json");
    const probePath = join(root, "mask-probe");
    mkdirSyncMock.mockImplementation((path, options) => {
      actualFs.writeFileSync(probePath, "probe", { mode: 0o777 });
      return actualFs.mkdirSync(path, options);
    });
    const actualUmask = process.umask.bind(process);
    const previousUmask = actualUmask(0o777);
    const umaskSpy = vi.spyOn(process, "umask").mockImplementation((mask?: number) => {
      if (mask === undefined) throw new Error("process.umask getter invoked");
      return actualUmask(mask);
    });
    try {
      await writeStoredUserOAuthToken(tokenPath, storedToken());
    } finally {
      umaskSpy.mockRestore();
      mkdirSyncMock.mockImplementation(actualFs.mkdirSync);
      actualUmask(previousUmask);
    }

    expect(statSync(probePath).mode & 0o777).toBe(0o700);
    expect(statSync(parent).mode & 0o777).toBe(0o700);
  });

  it("writes a regular final file with mode 0600", async () => {
    const tokenPath = join(makeTempDir(), "token.json");

    await writeStoredUserOAuthToken(tokenPath, storedToken());

    const status = lstatSync(tokenPath);
    expect(status.isFile()).toBe(true);
    expect(status.mode & 0o777).toBe(0o600);
  });

  it("replaces an existing token with an exact 0600 file under a restrictive umask", async () => {
    const tokenPath = join(makeTempDir(), "token.json");
    const replacement = storedToken({
      refresh_token: "replacement-token-placeholder",
      obtained_at: "2026-07-29T12:34:56.000Z",
    });
    writeJson(tokenPath, storedToken());
    chmodSync(tokenPath, 0o600);
    const previousUmask = process.umask(0o777);
    try {
      await writeStoredUserOAuthToken(tokenPath, replacement);
    } finally {
      process.umask(previousUmask);
    }

    expect(lstatSync(tokenPath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(tokenPath, "utf8"))).toEqual(replacement);
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

  it("rejects an invalid temporary inode before rename and preserves prior bytes", async () => {
    const actualFsPromises = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
    const tokenPath = join(makeTempDir(), "token.json");
    const originalBytes = `${JSON.stringify(
      storedToken({ obtained_at: "2026-07-27T12:34:56.000Z" }),
    )}\n`;
    writeFileSync(tokenPath, originalBytes, { encoding: "utf8", mode: 0o600 });
    openAsyncMock.mockImplementationOnce(async (...args: unknown[]) => {
      const handle = await actualFsPromises.open(
        ...(args as Parameters<typeof actualFsPromises.open>),
      );
      vi.spyOn(handle, "stat").mockResolvedValue({
        isFile: () => true,
        mode: 0o100644n,
      } as Awaited<ReturnType<typeof handle.stat>>);
      return handle;
    });

    const error = await captureAsyncPermissionDenied(() =>
      writeStoredUserOAuthToken(
        tokenPath,
        storedToken({ refresh_token: "replacement-token-placeholder" }),
      ),
    );

    expect(error).toMatchObject({
      details: { reason: "token_temporary_verification_failed" },
    });
    expect(readFileSync(tokenPath, "utf8")).toBe(originalBytes);
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("rejects a swapped temporary pathname before rename and preserves prior bytes", async () => {
    const actualFsPromises = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
    const tokenPath = join(makeTempDir(), "token.json");
    const originalBytes = `${JSON.stringify(
      storedToken({ obtained_at: "2026-07-27T12:34:56.000Z" }),
    )}\n`;
    writeFileSync(tokenPath, originalBytes, { encoding: "utf8", mode: 0o600 });
    openAsyncMock.mockImplementationOnce(async (...args: unknown[]) => {
      const candidatePath = String(args[0]);
      const handle = await actualFsPromises.open(
        ...(args as Parameters<typeof actualFsPromises.open>),
      );
      const realStat = handle.stat.bind(handle);
      vi.spyOn(handle, "stat").mockImplementation(async () => {
        const status = await realStat({ bigint: true });
        rmSync(candidatePath);
        writeFileSync(candidatePath, "swapped temporary file", {
          encoding: "utf8",
          mode: 0o600,
        });
        return status;
      });
      return handle;
    });

    const error = await captureAsyncPermissionDenied(() =>
      writeStoredUserOAuthToken(
        tokenPath,
        storedToken({ refresh_token: "replacement-token-placeholder" }),
      ),
    );

    expect(error).toMatchObject({
      details: { reason: "token_temporary_verification_failed" },
    });
    expect(readFileSync(tokenPath, "utf8")).toBe(originalBytes);
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("does not report failure after rename commits the replacement", async () => {
    const actualFsPromises = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
    const tokenPath = join(makeTempDir(), "token.json");
    const replacement = storedToken({
      refresh_token: "replacement-token-placeholder",
      obtained_at: "2026-07-29T12:34:56.000Z",
    });
    writeJson(tokenPath, storedToken({ obtained_at: "2026-07-27T12:34:56.000Z" }));
    let renameCommitted = false;
    renameMock.mockImplementationOnce(async (source, destination) => {
      await actualFsPromises.rename(source, destination);
      renameCommitted = true;
    });
    lstatAsyncMock.mockImplementation(async (...args: unknown[]) => {
      if (renameCommitted && String(args[0]) === tokenPath) {
        throw new Error("post-rename path lookup failed");
      }
      return actualFsPromises.lstat(
        ...(args as Parameters<typeof actualFsPromises.lstat>),
      );
    });

    try {
      await expect(writeStoredUserOAuthToken(tokenPath, replacement)).resolves.toBeUndefined();
    } finally {
      lstatAsyncMock.mockImplementation(actualFsPromises.lstat);
    }

    expect(JSON.parse(readFileSync(tokenPath, "utf8"))).toEqual(replacement);
  });

  it("cleans up its temporary file when rename fails", async () => {
    const dir = makeTempDir();
    const tokenPath = join(dir, "token.json");
    renameMock.mockRejectedValueOnce(new Error("rename failed"));

    await captureAsyncPermissionDenied(() => writeStoredUserOAuthToken(tokenPath, storedToken()));

    expect(readdirSync(dir)).toEqual([]);
  });

  it("does not unlink an unowned candidate when exclusive open reports a collision", async () => {
    const dir = makeTempDir();
    const tokenPath = join(dir, "token.json");
    let candidatePath = "";
    openAsyncMock.mockImplementationOnce(async (path) => {
      candidatePath = String(path);
      writeFileSync(candidatePath, "unowned sentinel", "utf8");
      throw Object.assign(new Error("exclusive open collision"), { code: "EEXIST" });
    });

    await captureAsyncPermissionDenied(() => writeStoredUserOAuthToken(tokenPath, storedToken()));

    expect(candidatePath).not.toBe("");
    expect(existsSync(candidatePath)).toBe(true);
    expect(readFileSync(candidatePath, "utf8")).toBe("unowned sentinel");
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

  it("does not chmod a replacement target when a created parent is swapped", async () => {
    const actualFsPromises = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
    const root = makeTempDir();
    const replacementTarget = makeTempDir();
    const parent = join(root, "oauth");
    const tokenPath = join(parent, "token.json");
    chmodSync(replacementTarget, 0o755);
    let swapped = false;
    const swapParent = () => {
      if (swapped) return;
      rmSync(parent, { recursive: true, force: true });
      symlinkSync(replacementTarget, parent);
      swapped = true;
    };
    chmodAsyncMock.mockImplementationOnce(async (path, mode) => {
      if (String(path) === parent) swapParent();
      await actualFsPromises.chmod(path, mode);
    });
    openAsyncMock.mockImplementationOnce(async (path, flags, mode) => {
      if (String(path) === parent) swapParent();
      return actualFsPromises.open(path, flags, mode);
    });

    await captureAsyncPermissionDenied(() => writeStoredUserOAuthToken(tokenPath, storedToken()));

    expect(swapped).toBe(true);
    expect(lstatSync(parent).isSymbolicLink()).toBe(true);
    expect(statSync(replacementTarget).mode & 0o777).toBe(0o755);
    expect(readdirSync(replacementTarget)).toEqual([]);
  });
});

afterEach(() => {
  chmodAsyncMock.mockClear();
  lstatAsyncMock.mockClear();
  mkdirSyncMock.mockClear();
  openAsyncMock.mockClear();
  openSyncMock.mockClear();
  readFileSyncMock.mockClear();
  for (const dir of tmpDirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});
