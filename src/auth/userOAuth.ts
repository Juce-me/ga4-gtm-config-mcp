import { constants, lstatSync, readFileSync } from "node:fs";
import { lstat, mkdir, open, rename, unlink, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import { google } from "googleapis";
import { z } from "zod";
import { MCPError } from "../utils/errors.js";

export type DesktopOAuthClient = {
  clientId: string;
  clientSecret: string;
};

export type StoredUserOAuthToken = {
  refresh_token: string;
  granted_scopes: string[];
  client_id: string;
  obtained_at: string;
};

export type UserOAuthPaths = {
  clientSecretsPath: string;
  tokenPath: string;
};

const TOKEN_FIELDS = [
  "refresh_token",
  "granted_scopes",
  "client_id",
  "obtained_at",
] as const;

const ISO_TIMESTAMP = z.iso.datetime({ offset: true });

function permissionDenied(reason: string): never {
  throw new MCPError(
    "PERMISSION_DENIED",
    "User OAuth configuration or token validation failed.",
    { reason },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readRegularJson(path: string, prefix: "client_secrets" | "token"): unknown {
  let status;
  try {
    status = lstatSync(path);
  } catch {
    return permissionDenied(`${prefix}_unreadable`);
  }

  if (!status.isFile()) {
    return permissionDenied(
      prefix === "client_secrets" ? "client_secrets_not_regular" : "token_not_regular",
    );
  }

  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return permissionDenied(`${prefix}_unreadable`);
  }

  try {
    return JSON.parse(contents) as unknown;
  } catch {
    return permissionDenied(`${prefix}_invalid_json`);
  }
}

function validateDesktopOAuthClient(value: unknown): DesktopOAuthClient {
  if (!isRecord(value) || !isRecord(value.installed)) {
    return permissionDenied("desktop_client_missing");
  }
  if (!isNonBlankString(value.installed.client_id)) {
    return permissionDenied("client_id_missing");
  }
  if (!isNonBlankString(value.installed.client_secret)) {
    return permissionDenied("client_secret_missing");
  }
  return {
    clientId: value.installed.client_id,
    clientSecret: value.installed.client_secret,
  };
}

function validateStoredToken(
  value: unknown,
  expectedClientId: string,
): StoredUserOAuthToken {
  if (!isRecord(value)) {
    return permissionDenied("token_invalid");
  }

  const keys = Object.keys(value);
  if (TOKEN_FIELDS.some((field) => !Object.hasOwn(value, field))) {
    return permissionDenied("token_missing_fields");
  }
  if (keys.some((key) => !TOKEN_FIELDS.includes(key as typeof TOKEN_FIELDS[number]))) {
    return permissionDenied("token_unknown_fields");
  }
  if (!isNonBlankString(value.refresh_token)) {
    return permissionDenied("token_refresh_token_invalid");
  }
  if (!Array.isArray(value.granted_scopes)) {
    return permissionDenied("token_scopes_invalid");
  }
  if (value.granted_scopes.length === 0) {
    return permissionDenied("token_scopes_empty");
  }
  if (!value.granted_scopes.every(isNonBlankString)) {
    return permissionDenied("token_scope_invalid");
  }
  if (new Set(value.granted_scopes).size !== value.granted_scopes.length) {
    return permissionDenied("token_scopes_duplicate");
  }
  if (!isNonBlankString(value.client_id)) {
    return permissionDenied("token_client_id_invalid");
  }
  if (!isNonBlankString(value.obtained_at) || !ISO_TIMESTAMP.safeParse(value.obtained_at).success) {
    return permissionDenied("token_timestamp_invalid");
  }
  if (value.client_id !== expectedClientId) {
    return permissionDenied("token_client_id_mismatch");
  }

  return {
    refresh_token: value.refresh_token,
    granted_scopes: [...value.granted_scopes],
    client_id: value.client_id,
    obtained_at: value.obtained_at,
  };
}

function serializableToken(token: StoredUserOAuthToken): StoredUserOAuthToken {
  const value: StoredUserOAuthToken = {
    refresh_token: token.refresh_token,
    granted_scopes: token.granted_scopes,
    client_id: token.client_id,
    obtained_at: token.obtained_at,
  };
  return validateStoredToken(value, value.client_id);
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

async function removeTemporaryFile(
  handle: FileHandle | undefined,
  temporaryPath: string | undefined,
): Promise<void> {
  if (handle) {
    try {
      await handle.close();
    } catch {
      // Continue to unlink the temporary file.
    }
  }
  if (temporaryPath) {
    try {
      await unlink(temporaryPath);
    } catch (error) {
      if (!isMissingFileError(error)) {
        permissionDenied("token_temp_cleanup_failed");
      }
    }
  }
}

export function resolveUserOAuthPaths(
  env: NodeJS.ProcessEnv = process.env,
): UserOAuthPaths {
  const clientSecretsPath = env.GOOGLE_OAUTH_CLIENT_SECRETS;
  const tokenPath = env.GOOGLE_OAUTH_TOKEN_PATH;

  if (!isNonBlankString(clientSecretsPath)) {
    return permissionDenied("client_secrets_path_missing");
  }
  if (!isNonBlankString(tokenPath)) {
    return permissionDenied("token_path_missing");
  }
  if (!isAbsolute(clientSecretsPath)) {
    return permissionDenied("client_secrets_path_not_absolute");
  }
  if (!isAbsolute(tokenPath)) {
    return permissionDenied("token_path_not_absolute");
  }

  return { clientSecretsPath, tokenPath };
}

export function readDesktopOAuthClient(path: string): DesktopOAuthClient {
  return validateDesktopOAuthClient(readRegularJson(path, "client_secrets"));
}

export function readStoredUserOAuthToken(
  path: string,
  expectedClientId: string,
): StoredUserOAuthToken {
  return validateStoredToken(readRegularJson(path, "token"), expectedClientId);
}

export function createUserOAuthClient(
  client: DesktopOAuthClient,
  token: StoredUserOAuthToken,
): InstanceType<typeof google.auth.OAuth2> {
  const validatedClient = validateDesktopOAuthClient({
    installed: {
      client_id: client.clientId,
      client_secret: client.clientSecret,
    },
  });
  const validatedToken = validateStoredToken(token, validatedClient.clientId);
  const auth = new google.auth.OAuth2(
    validatedClient.clientId,
    validatedClient.clientSecret,
  );
  auth.setCredentials({ refresh_token: validatedToken.refresh_token });
  return auth;
}

export function loadUserOAuth(env: NodeJS.ProcessEnv = process.env): {
  auth: InstanceType<typeof google.auth.OAuth2>;
  token: StoredUserOAuthToken;
  tokenPath: string;
} {
  const paths = resolveUserOAuthPaths(env);
  const client = readDesktopOAuthClient(paths.clientSecretsPath);
  const token = readStoredUserOAuthToken(paths.tokenPath, client.clientId);
  return {
    auth: createUserOAuthClient(client, token),
    token,
    tokenPath: paths.tokenPath,
  };
}

export async function writeStoredUserOAuthToken(
  tokenPath: string,
  token: StoredUserOAuthToken,
): Promise<void> {
  if (!isNonBlankString(tokenPath)) {
    permissionDenied("token_path_missing");
  }
  if (!isAbsolute(tokenPath)) {
    permissionDenied("token_path_not_absolute");
  }

  const value = serializableToken(token);
  const parent = dirname(tokenPath);
  let temporaryPath: string | undefined;
  let handle: FileHandle | undefined;

  try {
    await mkdir(parent, { recursive: true, mode: 0o700 });

    try {
      const destinationStatus = await lstat(tokenPath);
      if (!destinationStatus.isFile()) {
        permissionDenied("token_destination_not_regular");
      }
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }

    temporaryPath = join(parent, `.${randomUUID()}.tmp`);
    handle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;

    await rename(temporaryPath, tokenPath);
    temporaryPath = undefined;

    const finalStatus = await lstat(tokenPath);
    if (!finalStatus.isFile() || (finalStatus.mode & 0o777) !== 0o600) {
      permissionDenied("token_destination_verification_failed");
    }
  } catch (error) {
    await removeTemporaryFile(handle, temporaryPath);
    if (error instanceof MCPError) throw error;
    permissionDenied("token_write_failed");
  }
}
