import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runLogin } from "../src/cli/login.js";

const CLIENT_ID = "client-id-placeholder";
const CLIENT_SECRET = "client-secret-placeholder";
const AUTHORIZATION_CODE = "authorization-code-placeholder";
const REFRESH_TOKEN = "refresh-token-placeholder";
const CODE_VERIFIER = "pkce-verifier-placeholder-with-more-than-forty-three-characters";
const CODE_CHALLENGE = createHash("sha256")
  .update(CODE_VERIFIER)
  .digest("base64url");
const OBTAINED_AT = "2026-07-28T12:34:56.000Z";
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
] as const;
const SUCCESS_BODY = "Authorization completed. You may close this window.";
const FAILURE_BODY = "Authorization failed. You may close this window.";

type HttpResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type TokenResponse = {
  tokens: {
    refresh_token?: string | null;
    scope?: string | null;
  };
};

type OAuthHarnessOptions = {
  tokenResponse?: TokenResponse;
  tokenError?: unknown;
  tokenResponsePromise?: Promise<TokenResponse>;
  codeChallenge?: string;
};

const temporaryDirectories: string[] = [];

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    try {
      chmodSync(directory, 0o700);
    } catch {
      // The directory may already have been removed.
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function createFixture(): {
  env: NodeJS.ProcessEnv;
  tokenPath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "ga4-gtm-login-"));
  temporaryDirectories.push(directory);
  const clientSecretsPath = join(directory, "client.json");
  const tokenPath = join(directory, "token.json");
  writeFileSync(clientSecretsPath, `${JSON.stringify({
    installed: {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      redirect_uris: ["http://localhost"],
    },
  })}\n`, { encoding: "utf8", mode: 0o600 });
  return {
    env: {
      GOOGLE_OAUTH_CLIENT_SECRETS: clientSecretsPath,
      GOOGLE_OAUTH_TOKEN_PATH: tokenPath,
    },
    tokenPath,
  };
}

function createOAuthHarness(options: OAuthHarnessOptions = {}) {
  let markExchangeStarted: (() => void) | undefined;
  const exchangeStarted = new Promise<void>((resolve) => {
    markExchangeStarted = resolve;
  });
  const records: {
    createdWith: Array<{
      client: { clientId: string; clientSecret: string };
      redirectUri: string;
    }>;
    authOptions: Array<Record<string, unknown>>;
    tokenExchanges: Array<{
      code: string;
      codeVerifier: string;
      redirect_uri: string;
    }>;
  } = {
    createdWith: [],
    authOptions: [],
    tokenExchanges: [],
  };

  return {
    records,
    exchangeStarted,
    createOAuth2Client(
      client: { clientId: string; clientSecret: string },
      redirectUri: string,
    ) {
      records.createdWith.push({ client, redirectUri });
      return {
        async generateCodeVerifierAsync() {
          return {
            codeVerifier: CODE_VERIFIER,
            codeChallenge: options.codeChallenge ?? CODE_CHALLENGE,
          };
        },
        generateAuthUrl(authOptions: Record<string, unknown>) {
          records.authOptions.push(authOptions);
          const authorizationUrl = new URL("https://accounts.example/authorize");
          for (const [name, value] of Object.entries(authOptions)) {
            authorizationUrl.searchParams.set(
              name,
              Array.isArray(value) ? value.join(" ") : String(value),
            );
          }
          return authorizationUrl.toString();
        },
        async getToken(exchange: {
          code: string;
          codeVerifier: string;
          redirect_uri: string;
        }): Promise<TokenResponse> {
          records.tokenExchanges.push(exchange);
          markExchangeStarted?.();
          if (options.tokenError !== undefined) throw options.tokenError;
          if (options.tokenResponsePromise !== undefined) {
            return options.tokenResponsePromise;
          }
          return options.tokenResponse ?? {
            tokens: {
              refresh_token: REFRESH_TOKEN,
              scope: REQUIRED_SCOPES.join(" "),
            },
          };
        },
      };
    },
  };
}

function callbackUrlFromAuthorizationUrl(authorizationUrl: string): URL {
  const consentUrl = new URL(authorizationUrl);
  const callbackUrl = new URL(consentUrl.searchParams.get("redirect_uri") ?? "");
  callbackUrl.searchParams.set("code", AUTHORIZATION_CODE);
  callbackUrl.searchParams.set("state", consentUrl.searchParams.get("state") ?? "");
  return callbackUrl;
}

function sendHttpRequest(url: URL, method = "GET"): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.setTimeout(1_000, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}

function startCallbackFlow(options: {
  tokenResponse?: TokenResponse;
  tokenError?: unknown;
  mutateCallback?: (callbackUrl: URL, authorizationUrl: URL) => void;
  method?: string;
  timeoutMs?: number;
} = {}) {
  const fixture = createFixture();
  const oauth = createOAuthHarness({
    tokenResponse: options.tokenResponse,
    tokenError: options.tokenError,
  });
  let authorizationUrl = "";
  let browserResponse: Promise<HttpResponse> | undefined;

  const login = runLogin({
    env: fixture.env,
    dependencies: {
      createOAuth2Client: oauth.createOAuth2Client,
      onAuthorizationUrl(url) {
        authorizationUrl = url;
        const consentUrl = new URL(url);
        const callbackUrl = callbackUrlFromAuthorizationUrl(url);
        options.mutateCallback?.(callbackUrl, consentUrl);
        browserResponse = sendHttpRequest(callbackUrl, options.method);
      },
      now: () => new Date(OBTAINED_AT),
      timeoutMs: options.timeoutMs ?? 1_000,
    },
  });

  return {
    fixture,
    oauth,
    login,
    get authorizationUrl() {
      return authorizationUrl;
    },
    async browserResponse(): Promise<HttpResponse> {
      await login.catch(() => undefined);
      if (!browserResponse) throw new Error("Authorization callback was not sent");
      return browserResponse;
    },
  };
}

async function expectSafeLoginFailure(
  login: Promise<unknown>,
  sensitiveValues: string[] = [],
): Promise<void> {
  try {
    await login;
  } catch (error) {
    expect(error).toMatchObject({
      code: "PERMISSION_DENIED",
    });
    const serialized = JSON.stringify(error);
    for (const value of [
      AUTHORIZATION_CODE,
      REFRESH_TOKEN,
      CODE_VERIFIER,
      CLIENT_SECRET,
      ...sensitiveValues,
    ]) {
      expect(serialized).not.toContain(value);
    }
    return;
  }
  throw new Error("Expected login to fail");
}

function expectNoStoreResponse(
  response: HttpResponse,
  expectedStatus: number,
  expectedBody: string,
): void {
  expect(response.statusCode).toBe(expectedStatus);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toBe(expectedBody);
  expect(response.body).not.toContain(CLIENT_ID);
  expect(response.body).not.toContain(CLIENT_SECRET);
  expect(response.body).not.toContain(AUTHORIZATION_CODE);
  expect(response.body).not.toContain(REFRESH_TOKEN);
  expect(response.body).not.toContain(CODE_VERIFIER);
}

describe("runLogin", () => {
  it("completes a state-bound S256 loopback login and persists the strict token", async () => {
    const flow = startCallbackFlow();

    const result = await flow.login;
    const browserResponse = await flow.browserResponse();
    const consentUrl = new URL(flow.authorizationUrl);
    const state = consentUrl.searchParams.get("state");

    expect(result).toEqual({
      tokenPath: flow.fixture.tokenPath,
      grantedScopes: [...REQUIRED_SCOPES],
    });
    expectNoStoreResponse(browserResponse, 200, SUCCESS_BODY);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(state ?? "", "base64url").byteLength).toBeGreaterThanOrEqual(32);
    expect(consentUrl.searchParams.get("code_challenge")).toBe(CODE_CHALLENGE);
    expect(CODE_CHALLENGE).not.toBe("");
    expect(consentUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(flow.oauth.records.authOptions).toEqual([{
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: false,
      scope: [...REQUIRED_SCOPES],
      redirect_uri: flow.oauth.records.createdWith[0]?.redirectUri,
      state,
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: "S256",
    }]);
    expect(flow.oauth.records.createdWith[0]?.redirectUri).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/oauth2\/callback$/,
    );
    expect(flow.oauth.records.tokenExchanges).toEqual([{
      code: AUTHORIZATION_CODE,
      codeVerifier: CODE_VERIFIER,
      redirect_uri: flow.oauth.records.createdWith[0]?.redirectUri,
    }]);
    expect(JSON.parse(readFileSync(flow.fixture.tokenPath, "utf8"))).toEqual({
      refresh_token: REFRESH_TOKEN,
      granted_scopes: [...REQUIRED_SCOPES],
      client_id: CLIENT_ID,
      obtained_at: OBTAINED_AT,
    });
  });

  it("writes the authorization URL exactly once to stderr and no other secrets", async () => {
    const fixture = createFixture();
    const oauth = createOAuthHarness();
    const stderrChunks: string[] = [];
    let authorizationUrl = "";
    let browserResponse: Promise<HttpResponse> | undefined;
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
      const text = String(chunk);
      stderrChunks.push(text);
      if (!authorizationUrl && text.includes("https://accounts.example/authorize")) {
        authorizationUrl = text.trim();
        browserResponse = sendHttpRequest(
          callbackUrlFromAuthorizationUrl(authorizationUrl),
        );
      }
      return true;
    }) as typeof process.stderr.write);

    await runLogin({
      env: fixture.env,
      dependencies: {
        createOAuth2Client: oauth.createOAuth2Client,
        now: () => new Date(OBTAINED_AT),
        timeoutMs: 1_000,
      },
    });
    const response = await browserResponse;
    const stderr = stderrChunks.join("");

    expect(response).toBeDefined();
    expect(stderr.split(authorizationUrl).length - 1).toBe(1);
    expect(stderr).not.toContain(REFRESH_TOKEN);
    expect(stderr).not.toContain(AUTHORIZATION_CODE);
    expect(stderr).not.toContain(CODE_VERIFIER);
    expect(stderr).not.toContain(CLIENT_SECRET);
  });

  it("rejects an empty PKCE challenge before displaying the consent URL", async () => {
    const fixture = createFixture();
    const oauth = createOAuthHarness({ codeChallenge: "" });
    let authorizationUrlCalls = 0;

    await expectSafeLoginFailure(runLogin({
      env: fixture.env,
      dependencies: {
        createOAuth2Client: oauth.createOAuth2Client,
        onAuthorizationUrl() {
          authorizationUrlCalls++;
        },
        now: () => new Date(OBTAINED_AT),
        timeoutMs: 20,
      },
    }));

    expect(authorizationUrlCalls).toBe(0);
    expect(oauth.records.authOptions).toEqual([]);
    expect(oauth.records.tokenExchanges).toEqual([]);
  });

  it.each([
    [
      "missing state",
      (callbackUrl: URL) => callbackUrl.searchParams.delete("state"),
    ],
    [
      "duplicate state",
      (callbackUrl: URL) => callbackUrl.searchParams.append(
        "state",
        callbackUrl.searchParams.get("state") ?? "",
      ),
    ],
    [
      "mismatched state",
      (callbackUrl: URL) => callbackUrl.searchParams.set(
        "state",
        "mismatched-state-placeholder",
      ),
    ],
  ])("rejects %s before token exchange", async (_name, mutateCallback) => {
    const flow = startCallbackFlow({ mutateCallback });

    await expectSafeLoginFailure(flow.login, ["mismatched-state-placeholder"]);
    expectNoStoreResponse(await flow.browserResponse(), 400, FAILURE_BODY);
    expect(flow.oauth.records.tokenExchanges).toEqual([]);
  });

  it.each([
    [
      "missing code",
      (callbackUrl: URL) => callbackUrl.searchParams.delete("code"),
    ],
    [
      "duplicate code",
      (callbackUrl: URL) => callbackUrl.searchParams.append(
        "code",
        "second-authorization-code-placeholder",
      ),
    ],
  ])("rejects %s before token exchange", async (_name, mutateCallback) => {
    const flow = startCallbackFlow({ mutateCallback });

    await expectSafeLoginFailure(flow.login, ["second-authorization-code-placeholder"]);
    expectNoStoreResponse(await flow.browserResponse(), 400, FAILURE_BODY);
    expect(flow.oauth.records.tokenExchanges).toEqual([]);
  });

  it("rejects provider denial without retaining or echoing provider query values", async () => {
    const providerError = "provider-denial-placeholder";
    const providerDescription = "provider-description-placeholder";
    const flow = startCallbackFlow({
      mutateCallback(callbackUrl) {
        callbackUrl.searchParams.set("error", providerError);
        callbackUrl.searchParams.set("error_description", providerDescription);
      },
    });

    await expectSafeLoginFailure(flow.login, [providerError, providerDescription]);
    const response = await flow.browserResponse();
    expectNoStoreResponse(response, 400, FAILURE_BODY);
    expect(response.body).not.toContain(providerError);
    expect(response.body).not.toContain(providerDescription);
    expect(flow.oauth.records.tokenExchanges).toEqual([]);
  });

  it.each([
    [
      "a wrong method",
      { method: "POST" },
      405,
    ],
    [
      "a wrong path",
      {
        mutateCallback: (callbackUrl: URL) => {
          callbackUrl.pathname = "/oauth2/not-the-callback";
        },
      },
      404,
    ],
  ])("rejects %s and closes without token exchange", async (_name, requestOptions, status) => {
    const flow = startCallbackFlow(requestOptions);

    await expectSafeLoginFailure(flow.login);
    expectNoStoreResponse(await flow.browserResponse(), status, FAILURE_BODY);
    expect(flow.oauth.records.tokenExchanges).toEqual([]);
  });

  it("times out and closes the listener", async () => {
    const fixture = createFixture();
    const oauth = createOAuthHarness();
    let authorizationUrl = "";
    const login = runLogin({
      env: fixture.env,
      dependencies: {
        createOAuth2Client: oauth.createOAuth2Client,
        onAuthorizationUrl(url) {
          authorizationUrl = url;
        },
        now: () => new Date(OBTAINED_AT),
        timeoutMs: 20,
      },
    });

    await expectSafeLoginFailure(login);

    expect(authorizationUrl).not.toBe("");
    await expect(sendHttpRequest(callbackUrlFromAuthorizationUrl(authorizationUrl))).rejects
      .toThrow();
    expect(oauth.records.tokenExchanges).toEqual([]);
  });

  it("invalidates a delayed exchange at timeout without replacing the existing token", async () => {
    const fixture = createFixture();
    const delayedTokenResponse = deferred<TokenResponse>();
    const oauth = createOAuthHarness({
      tokenResponsePromise: delayedTokenResponse.promise,
    });
    const originalToken = `${JSON.stringify({
      refresh_token: "existing-refresh-token-placeholder",
      granted_scopes: [...REQUIRED_SCOPES],
      client_id: CLIENT_ID,
      obtained_at: "2026-01-02T03:04:05.000Z",
    })}\n`;
    writeFileSync(fixture.tokenPath, originalToken, {
      encoding: "utf8",
      mode: 0o600,
    });
    let authorizationUrl = "";
    let browserResponse: Promise<HttpResponse> | undefined;
    const login = runLogin({
      env: fixture.env,
      dependencies: {
        createOAuth2Client: oauth.createOAuth2Client,
        onAuthorizationUrl(url) {
          authorizationUrl = url;
          browserResponse = sendHttpRequest(callbackUrlFromAuthorizationUrl(url));
        },
        now: () => new Date(OBTAINED_AT),
        timeoutMs: 30,
      },
    });
    const loginOutcome = login.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );

    await oauth.exchangeStarted;
    const promptOutcome = await Promise.race([
      loginOutcome,
      new Promise<{ status: "still_pending" }>((resolve) => {
        setTimeout(() => resolve({ status: "still_pending" }), 250);
      }),
    ]);
    delayedTokenResponse.resolve({
      tokens: {
        refresh_token: REFRESH_TOKEN,
        scope: REQUIRED_SCOPES.join(" "),
      },
    });
    const eventualOutcome = await loginOutcome;
    const browserOutcome = browserResponse === undefined
      ? undefined
      : await Promise.allSettled([browserResponse]).then(([result]) => result);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(promptOutcome).toMatchObject({
      status: "rejected",
      error: { code: "PERMISSION_DENIED" },
    });
    expect(eventualOutcome).toMatchObject({
      status: "rejected",
      error: { code: "PERMISSION_DENIED" },
    });
    if (browserOutcome?.status === "fulfilled") {
      expect(browserOutcome.value.statusCode).not.toBe(200);
      expect(browserOutcome.value.body).not.toBe(SUCCESS_BODY);
    } else {
      expect(browserOutcome?.status).toBe("rejected");
    }
    expect(readFileSync(fixture.tokenPath, "utf8")).toBe(originalToken);
    await expect(
      sendHttpRequest(callbackUrlFromAuthorizationUrl(authorizationUrl)),
    ).rejects.toThrow();
    expect(oauth.records.tokenExchanges).toHaveLength(1);
  });

  it.each([
    [
      "a partial scope grant",
      {
        tokens: {
          refresh_token: REFRESH_TOKEN,
          scope: REQUIRED_SCOPES.slice(0, -1).join(" "),
        },
      },
    ],
    [
      "a missing scope response",
      {
        tokens: {
          refresh_token: REFRESH_TOKEN,
          scope: null,
        },
      },
    ],
  ])("rejects %s without persisting", async (_name, tokenResponse) => {
    const flow = startCallbackFlow({ tokenResponse });

    await expectSafeLoginFailure(flow.login);
    expectNoStoreResponse(await flow.browserResponse(), 400, FAILURE_BODY);
    expect(() => readFileSync(flow.fixture.tokenPath, "utf8")).toThrow();
  });

  it.each([null, "", " "])(
    "rejects a missing or blank refresh token without persisting",
    async (refreshToken) => {
      const flow = startCallbackFlow({
        tokenResponse: {
          tokens: {
            refresh_token: refreshToken,
            scope: REQUIRED_SCOPES.join(" "),
          },
        },
      });

      await expectSafeLoginFailure(flow.login);
      expectNoStoreResponse(await flow.browserResponse(), 400, FAILURE_BODY);
      expect(() => readFileSync(flow.fixture.tokenPath, "utf8")).toThrow();
    },
  );

  it("preserves a valid existing token when re-login token exchange fails", async () => {
    const exchangeMessage = "raw-token-exchange-failure-placeholder";
    const flow = startCallbackFlow({
      tokenError: new Error(exchangeMessage),
    });
    const originalToken = `${JSON.stringify({
      refresh_token: "existing-refresh-token-placeholder",
      granted_scopes: [...REQUIRED_SCOPES],
      client_id: CLIENT_ID,
      obtained_at: "2026-01-02T03:04:05.000Z",
    })}\n`;
    writeFileSync(flow.fixture.tokenPath, originalToken, {
      encoding: "utf8",
      mode: 0o600,
    });

    await expectSafeLoginFailure(flow.login, [exchangeMessage]);

    expectNoStoreResponse(await flow.browserResponse(), 400, FAILURE_BODY);
    expect(flow.oauth.records.tokenExchanges).toHaveLength(1);
    expect(readFileSync(flow.fixture.tokenPath, "utf8")).toBe(originalToken);
  });

  it("consumes at most one valid callback", async () => {
    const fixture = createFixture();
    const oauth = createOAuthHarness();
    const browserResponses: Array<Promise<HttpResponse>> = [];
    const login = runLogin({
      env: fixture.env,
      dependencies: {
        createOAuth2Client: oauth.createOAuth2Client,
        onAuthorizationUrl(url) {
          const callbackUrl = callbackUrlFromAuthorizationUrl(url);
          browserResponses.push(sendHttpRequest(callbackUrl));
          browserResponses.push(sendHttpRequest(callbackUrl));
        },
        now: () => new Date(OBTAINED_AT),
        timeoutMs: 1_000,
      },
    });

    await login;
    const responses = await Promise.allSettled(browserResponses);

    expect(oauth.records.tokenExchanges).toHaveLength(1);
    expect(responses.filter(
      (response) => response.status === "fulfilled" && response.value.statusCode === 200,
    )).toHaveLength(1);
  });

  it("closes the listener after successful login", async () => {
    const flow = startCallbackFlow();

    await flow.login;
    await flow.browserResponse();

    await expect(
      sendHttpRequest(callbackUrlFromAuthorizationUrl(flow.authorizationUrl)),
    ).rejects.toThrow();
    expect(flow.oauth.records.tokenExchanges).toHaveLength(1);
  });

  it.each([
    {},
    {
      GOOGLE_OAUTH_CLIENT_SECRETS: "relative-client.json",
      GOOGLE_OAUTH_TOKEN_PATH: "/tmp/token.json",
    },
  ])("validates both absolute configuration paths before consent", async (env) => {
    const oauth = createOAuthHarness();
    let authorizationUrlCalls = 0;

    await expectSafeLoginFailure(runLogin({
      env,
      dependencies: {
        createOAuth2Client: oauth.createOAuth2Client,
        onAuthorizationUrl() {
          authorizationUrlCalls++;
        },
        now: () => new Date(OBTAINED_AT),
        timeoutMs: 20,
      },
    }));

    expect(oauth.records.createdWith).toEqual([]);
    expect(authorizationUrlCalls).toBe(0);
  });
});
