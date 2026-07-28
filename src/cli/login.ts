import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";
import { google } from "googleapis";
import {
  readDesktopOAuthClient,
  resolveUserOAuthPaths,
  writeStoredUserOAuthToken,
  type DesktopOAuthClient,
} from "../auth/userOAuth.js";
import { ALL_LOGIN_SCOPES } from "../auth/scopes.js";
import { MCPError } from "../utils/errors.js";

const CALLBACK_PATH = "/oauth2/callback";
const DEFAULT_TIMEOUT_MS = 300_000;
const SUCCESS_BODY = "Authorization completed. You may close this window.";
const FAILURE_BODY = "Authorization failed. You may close this window.";

type OAuth2ClientBoundary = {
  generateCodeVerifierAsync(): Promise<{
    codeVerifier: string;
    codeChallenge: string;
  }>;
  generateAuthUrl(options: Record<string, unknown>): string;
  getToken(options: {
    code: string;
    codeVerifier: string;
    redirect_uri: string;
  }): Promise<{
    tokens: {
      refresh_token?: string | null;
      scope?: string | null;
    };
  }>;
};

export type LoginDependencies = {
  createOAuth2Client: (
    client: DesktopOAuthClient,
    redirectUri: string,
  ) => OAuth2ClientBoundary;
  onAuthorizationUrl(url: string): void;
  now(): Date;
  timeoutMs: number;
};

type Listener = {
  server: Server;
  redirectUri: string;
  close(): Promise<void>;
};

type LoginPhase = "pre-commit" | "committing" | "committed";

type LoginLifecycle = {
  phase: LoginPhase;
};

function loginFailure(reason: string): MCPError {
  return new MCPError(
    "PERMISSION_DENIED",
    "User OAuth login failed.",
    { reason },
  );
}

function requirePkceValue(
  value: string | undefined,
  reason: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw loginFailure(reason);
  }
  return value;
}

function defaultOAuth2Client(
  client: DesktopOAuthClient,
  redirectUri: string,
): OAuth2ClientBoundary {
  const auth = new google.auth.OAuth2(
    client.clientId,
    client.clientSecret,
    redirectUri,
  );
  return {
    async generateCodeVerifierAsync() {
      const generated = await auth.generateCodeVerifierAsync();
      return {
        codeVerifier: requirePkceValue(
          generated.codeVerifier,
          "pkce_verifier_missing",
        ),
        codeChallenge: requirePkceValue(
          generated.codeChallenge,
          "pkce_challenge_missing",
        ),
      };
    },
    generateAuthUrl: (options) => auth.generateAuthUrl(
      options as Parameters<typeof auth.generateAuthUrl>[0],
    ),
    async getToken(options) {
      const response = await auth.getToken(options);
      return {
        tokens: {
          refresh_token: response.tokens.refresh_token,
          scope: response.tokens.scope,
        },
      };
    },
  };
}

const DEFAULT_DEPENDENCIES: LoginDependencies = {
  createOAuth2Client: defaultOAuth2Client,
  onAuthorizationUrl: (url) => {
    process.stderr.write(`${url}\n`);
  },
  now: () => new Date(),
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

async function openLoopbackListener(): Promise<Listener> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    const onError = () => {
      server.off("listening", onListening);
      reject(loginFailure("listener_start_failed"));
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port: 0 });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw loginFailure("listener_address_unavailable");
  }

  let closePromise: Promise<void> | undefined;
  return {
    server,
    redirectUri: `http://127.0.0.1:${address.port}${CALLBACK_PATH}`,
    close() {
      closePromise ??= new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => {
          if (error) {
            reject(loginFailure("listener_close_failed"));
            return;
          }
          resolve();
        });
      });
      return closePromise;
    },
  };
}

function sendBrowserResponse(
  response: ServerResponse,
  statusCode: number,
  body: string,
): void {
  if (response.writableEnded) return;
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    Connection: "close",
  });
  response.end(body);
}

function sendBrowserResponseSafely(
  response: ServerResponse,
  statusCode: number,
  body: string,
): void {
  try {
    sendBrowserResponse(response, statusCode, body);
  } catch {
    // Browser transport failures do not determine the login result.
  }
}

function stateMatches(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length
    && timingSafeEqual(expectedBytes, actualBytes);
}

function callbackValue(
  requestUrl: URL,
  name: "code" | "state",
): { ok: true; value: string } | { ok: false; reason: string } {
  const values = requestUrl.searchParams.getAll(name);
  if (values.length !== 1) {
    return {
      ok: false,
      reason: values.length === 0
        ? `callback_${name}_missing`
        : `callback_${name}_duplicate`,
    };
  }
  const value = values[0];
  if (value === undefined || value.trim().length === 0) {
    return { ok: false, reason: `callback_${name}_missing` };
  }
  return { ok: true, value };
}

function parseGrantedScopes(scope: string | null | undefined): string[] {
  if (typeof scope !== "string" || scope.trim().length === 0) {
    throw loginFailure("oauth_scope_missing");
  }
  const grantedScopes = Array.from(new Set(scope.trim().split(/\s+/u)));
  if (ALL_LOGIN_SCOPES.some((requiredScope) => !grantedScopes.includes(requiredScope))) {
    throw loginFailure("oauth_scope_incomplete");
  }
  return grantedScopes;
}

function requireRefreshToken(
  refreshToken: string | null | undefined,
): string {
  if (typeof refreshToken !== "string" || refreshToken.trim().length === 0) {
    throw loginFailure("oauth_refresh_token_missing");
  }
  return refreshToken;
}

function waitForCallback(options: {
  listener: Listener;
  oauth: OAuth2ClientBoundary;
  expectedState: string;
  codeVerifier: string;
  tokenPath: string;
  clientId: string;
  now: () => Date;
  timeoutMs: number;
  lifecycle: LoginLifecycle;
}): Promise<{ tokenPath: string; grantedScopes: string[] }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let callbackConsumed = false;
    let activeGeneration = 0;

    const beginShutdown = (forceActiveConnections: boolean) => {
      void options.listener.close().catch(() => {
        // The outer lifecycle awaits and translates listener-close failures.
      });
      if (forceActiveConnections) {
        try {
          options.listener.server.closeAllConnections();
        } catch {
          // Cleanup does not determine the login result.
        }
      }
    };

    const finish = (
      result:
        | { ok: true; value: { tokenPath: string; grantedScopes: string[] } }
        | { ok: false; error: MCPError },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.listener.server.off("error", onServerError);
      if (result.ok) {
        resolve(result.value);
      } else {
        reject(result.error);
      }
    };

    const claimCommitPhase = (callbackGeneration: number): boolean => {
      if (
        settled
        || options.lifecycle.phase !== "pre-commit"
        || activeGeneration !== callbackGeneration
      ) {
        return false;
      }
      options.lifecycle.phase = "committing";
      clearTimeout(timeout);
      return true;
    };

    const rejectRequest = (
      response: ServerResponse,
      statusCode: number,
      reason: string,
    ) => {
      sendBrowserResponseSafely(response, statusCode, FAILURE_BODY);
      finish({ ok: false, error: loginFailure(reason) });
    };

    const onServerError = () => {
      if (options.lifecycle.phase !== "pre-commit") return;
      activeGeneration++;
      beginShutdown(true);
      finish({ ok: false, error: loginFailure("listener_failed") });
    };

    const onRequest = (request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        if (settled || callbackConsumed) {
          sendBrowserResponseSafely(response, 400, FAILURE_BODY);
          return;
        }
        if (request.method !== "GET") {
          rejectRequest(response, 405, "callback_method_invalid");
          return;
        }

        let requestUrl: URL;
        try {
          requestUrl = new URL(request.url ?? "", options.listener.redirectUri);
        } catch {
          rejectRequest(response, 400, "callback_url_invalid");
          return;
        }
        if (
          requestUrl.origin !== new URL(options.listener.redirectUri).origin
          || requestUrl.pathname !== CALLBACK_PATH
        ) {
          rejectRequest(response, 404, "callback_path_invalid");
          return;
        }
        if (requestUrl.searchParams.getAll("error").length > 0) {
          rejectRequest(response, 400, "oauth_provider_denied");
          return;
        }

        const code = callbackValue(requestUrl, "code");
        if (!code.ok) {
          rejectRequest(response, 400, code.reason);
          return;
        }
        const state = callbackValue(requestUrl, "state");
        if (!state.ok) {
          rejectRequest(response, 400, state.reason);
          return;
        }
        if (!stateMatches(options.expectedState, state.value)) {
          rejectRequest(response, 400, "callback_state_mismatch");
          return;
        }

        callbackConsumed = true;
        const callbackGeneration = ++activeGeneration;
        const callbackIsActive = () =>
          !settled && activeGeneration === callbackGeneration;
        beginShutdown(false);

        let refreshToken: string;
        let grantedScopes: string[];
        let obtainedAt: string;
        try {
          let tokenResponse: Awaited<ReturnType<OAuth2ClientBoundary["getToken"]>>;
          try {
            tokenResponse = await options.oauth.getToken({
              code: code.value,
              codeVerifier: options.codeVerifier,
              redirect_uri: options.listener.redirectUri,
            });
          } catch {
            if (!callbackIsActive()) return;
            throw loginFailure("token_exchange_failed");
          }

          if (!callbackIsActive()) return;
          refreshToken = requireRefreshToken(tokenResponse.tokens.refresh_token);
          grantedScopes = parseGrantedScopes(tokenResponse.tokens.scope);
          obtainedAt = options.now().toISOString();
        } catch (error) {
          if (!callbackIsActive()) return;
          sendBrowserResponseSafely(response, 400, FAILURE_BODY);
          finish({
            ok: false,
            error: error instanceof MCPError
              ? error
              : loginFailure("login_callback_failed"),
          });
          return;
        }

        if (!claimCommitPhase(callbackGeneration)) return;
        try {
          await writeStoredUserOAuthToken(options.tokenPath, {
            refresh_token: refreshToken,
            granted_scopes: grantedScopes,
            client_id: options.clientId,
            obtained_at: obtainedAt,
          });
        } catch (error) {
          if (!callbackIsActive()) return;
          sendBrowserResponseSafely(response, 400, FAILURE_BODY);
          finish({
            ok: false,
            error: error instanceof MCPError
              ? error
              : loginFailure("login_callback_failed"),
          });
          return;
        }

        options.lifecycle.phase = "committed";
        sendBrowserResponseSafely(response, 200, SUCCESS_BODY);
        finish({
          ok: true,
          value: {
            tokenPath: options.tokenPath,
            grantedScopes,
          },
        });
      })();
    };

    const timeout = setTimeout(() => {
      if (options.lifecycle.phase !== "pre-commit") return;
      activeGeneration++;
      beginShutdown(true);
      finish({ ok: false, error: loginFailure("login_timeout") });
    }, options.timeoutMs);

    options.listener.server.on("request", onRequest);
    options.listener.server.on("error", onServerError);
  });
}

export async function runLogin(options?: {
  env?: NodeJS.ProcessEnv;
  dependencies?: Partial<LoginDependencies>;
}): Promise<{ tokenPath: string; grantedScopes: string[] }> {
  const dependencies: LoginDependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...options?.dependencies,
  };
  const paths = resolveUserOAuthPaths(options?.env ?? process.env);
  const client = readDesktopOAuthClient(paths.clientSecretsPath);
  const listener = await openLoopbackListener();
  const lifecycle: LoginLifecycle = { phase: "pre-commit" };

  try {
    const oauth = dependencies.createOAuth2Client(client, listener.redirectUri);
    const generatedPkce = await oauth.generateCodeVerifierAsync();
    const codeVerifier = requirePkceValue(
      generatedPkce.codeVerifier,
      "pkce_verifier_missing",
    );
    const codeChallenge = requirePkceValue(
      generatedPkce.codeChallenge,
      "pkce_challenge_missing",
    );
    const state = randomBytes(32).toString("base64url");
    const authorizationUrl = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: false,
      scope: ALL_LOGIN_SCOPES,
      redirect_uri: listener.redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    dependencies.onAuthorizationUrl(authorizationUrl);

    return await waitForCallback({
      listener,
      oauth,
      expectedState: state,
      codeVerifier,
      tokenPath: paths.tokenPath,
      clientId: client.clientId,
      now: dependencies.now,
      timeoutMs: dependencies.timeoutMs,
      lifecycle,
    });
  } catch (error) {
    if (error instanceof MCPError) throw error;
    throw loginFailure("login_initialization_failed");
  } finally {
    try {
      await listener.close();
    } catch (error) {
      if (lifecycle.phase === "pre-commit") throw error;
    }
  }
}

async function main(): Promise<void> {
  await runLogin();
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch(() => {
    process.stderr.write("User OAuth login failed.\n");
    process.exitCode = 1;
  });
}
