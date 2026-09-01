# Replace workload credentials with user OAuth

Status: obsolete
Review: approved
Type: feature
Author: a.feygin

## Outcome

Implemented with changes. The implementation and automated acceptance are complete, but
credentialed manual acceptance was not performed. Shipped code and current product
documentation are now the source of truth.

Fresh automated verification on 2026-07-28 produced these results:

- `npm run typecheck`: exited `0`.
- `npm run build`: exited `0`.
- `npm test`: exited `0`; 38 test files and 232 tests passed.
- The focused OAuth run exited `0`; 90 tests across `tests/auth.test.ts`,
  `tests/auth.userOAuth.test.ts`, and `tests/cli.login.test.ts` passed, including real
  loopback-listener coverage.
- The focused safety and server-contract run exited `0`; 46 tests across the nine
  `src/safety/` areas passed, and the server bootstrap test confirmed the exact 12-tool
  catalog and safe metadata (47 tests total across 10 files).
- `git diff --check`: exited `0`.
- The pre-artifact `git status --short` produced no output. The implementation diff from
  the approved-plan base was confined to files listed under **Files allowed to touch**;
  protected `src/tools/`, `src/ga4/`, `src/gtm/`, `src/planner/`, `src/spec/`, and
  `src/safety/` paths were unchanged.
- `ALL_LOGIN_SCOPES` was evaluated from the built output as the six-element unique union of
  all four runtime scope arrays; both `tagmanager.edit.containerversions` and
  `tagmanager.publish` were present.
- The removed credential-source/bootstrap modules, tests, and `bootstrap:access` script
  were absent. Canonical workload/bootstrap scans returned no matches.
- `.secrets/`, `dist/`, and `.env` contained no tracked files and remained ignored.
  Tracked-filename and tracked-content scans found no private OAuth client/token file or
  credential-shaped value. Placeholder-only examples and test values remain intentional.
- All 16 relative Markdown links and anchors in `README.md` and `docs/setup/` resolved.

Manual OAuth login, private GA4/GTM reads, and local MCP registration were **not
performed — pending operator acceptance with private local values**. No live write or
publish was performed. The token file's real mode, stored key names, client-ID equality,
timestamp, and granted scopes therefore were not manually inspected.

The implementation materially diverged from the first-pass mechanics in four hardening
rounds:

- Descriptor-safe token I/O added no-follow regular-file reads, exclusive temporary-file
  creation, explicit file and newly-created-directory mode verification, synchronized
  atomic replacement, failure cleanup, and preservation of an existing token.
- Timeout invalidation prevents a callback or token exchange that finishes after the
  five-minute deadline from persisting credentials.
- Commit linearization lets only one valid callback claim the persistence phase and
  prevents the timeout and callback paths from racing the final token replacement.
- Final review hardening rejects normalized-path and existing-inode collisions between the
  Desktop client JSON and token destination before login or runtime loading.
- Temporary-token regular-file identity and exact mode are verified before rename; successful
  same-directory rename is now the no-fail persistence commit point.
- Login now models explicit pre-commit, committing, and committed phases. Once persistence
  starts, only the token writer determines the result, and listener, browser, or cleanup
  failures cannot override a committed replacement.

Task 6 reviewed every changed canonical setup document against all four
`docs/AGENTS.md` dimensions: UI/UX wording and flow, backend/API correctness,
security/privacy, and architecture/contracts. The review found the implemented contracts
and current guidance aligned. Accessibility-specific UI wording, HTTP status/rate-limit
documentation, and distributed-service contracts were not applicable to these local,
text-only setup documents. The repository still has no documented vulnerability/incident
contact; none was invented as part of this feature.

## Current Accuracy

Obsolete: Application Default Credentials superseded this repository-managed Desktop OAuth
runtime and login contract. Its historical implementation and verification record is
preserved above; current guidance is in
[the executed ADC-only authentication design](EXECUTED-2026-09-01-adc-only-auth-design.md)
and [the executed ADC-only authentication implementation plan](EXECUTED-2026-09-01-adc-only-auth-implementation.md).

> **Execution requirement:** Implement the tasks in order, keep each checkpoint green,
> and stop if the implementation needs a file or contract outside the allowed scope.

## Goal

Make every GA4/GTM API call run under the solo operator's Google identity and existing
GA4/GTM permissions. A standalone browser login stores a refresh token once; the stdio MCP
runtime loads and refreshes it on later calls.

This intentionally replaces every workload credential path. After this change there is no
service-account, Workload Identity Federation, impersonated ADC, metadata, or CI/non-human
runtime authentication.

## Readiness assessment

This rewritten plan is ready to execute. The previous version was not ready because it:

- treated `PUBLISH_SCOPES` as the full login scope set even though it omits
  `tagmanager.edit.containerversions`;
- proposed rewriting `credentialSource.ts` into a one-value abstraction instead of deleting
  the obsolete module;
- omitted PKCE, OAuth `state`, callback hardening, atomic token replacement, bounded login
  lifetime, and refresh-token failure translation;
- bypassed the real HTTP callback listener in tests;
- did not account for Google's seven-day refresh-token lifetime for External OAuth apps in
  Testing;
- claimed too broadly that MCP could not support the same third-party authorization flow.

## Architecture

`src/auth/userOAuth.ts` is the single deep module for OAuth configuration, persisted-token
validation, OAuth2 client construction, and secure token replacement. `src/cli/login.ts`
owns the interactive installed-app flow. `src/auth/googleAuth.ts` keeps its existing
`buildAuth({ mode })` interface and becomes a thin runtime gate:

```text
npm run login
  -> Desktop client secrets
  -> loopback OAuth with state + PKCE
  -> validate refresh token and full granted-scope union
  -> atomically replace the single local token file

MCP tool call
  -> buildAuth({ mode })
  -> enforce publish-mode environment gate
  -> load and validate client secrets + stored token
  -> assert the mode's scopes
  -> prime refresh and translate invalid_grant
  -> return google.auth.OAuth2
```

The token store is deliberately single-user. The most recent successful login replaces the
active identity for the entire local server. There is no per-MCP-session or per-tool identity.

## MCP authorization boundary

The premise that current MCP cannot support equivalent Google authorization is false.

As of this plan's 2026-07-28 review:

- MCP `2025-11-25` is the latest final protocol revision. Its HTTP authorization flow
  authenticates an MCP client to an MCP server; it does not produce a Google access token,
  and MCP bearer-token passthrough to Google is forbidden. That core authorization flow is
  HTTP-specific; stdio credentials are an application/environment concern.
- The same stable revision explicitly supports downstream third-party OAuth through
  URL-mode elicitation. A server can present an OAuth URL, receive the provider callback,
  store the provider token, and notify the initiating client.
- URL elicitation can travel over stdio when the MCP client advertises
  `capabilities.elicitation.url`.
- This repository's installed `@modelcontextprotocol/sdk` 1.29.0 contains URL elicitation,
  `elicitInput`, `UrlElicitationRequiredError`, and completion-notification support.

Authoritative references:

- [MCP 2025-11-25 URL-mode elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
- [MCP 2025-11-25 authorization boundary](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [TypeScript SDK 1.29.0 server implementation](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.29.0/src/server/index.ts)
- [MCP releases](https://github.com/modelcontextprotocol/modelcontextprotocol/releases)

This feature still uses a standalone `npm run login` command. That is a product choice for a
single-user local stdio server, not a protocol limitation. It works before any MCP session
exists, is independent of client capability negotiation, and does not force every
auth-dependent tool to implement interruption/retry behavior.

MCP URL elicitation is a viable future alternative, but it is explicitly out of scope here.
Adding it would require capability negotiation, callback lifecycle management inside the
running server, completion/retry behavior, phishing-resistant binding between the browser
user and the initiating MCP user, and a fallback for clients without URL elicitation.
Do not design that future feature against the non-final 2026 release candidate without a
fresh review; its elicitation lifecycle differs from stable `2025-11-25`.

## Fixed decisions

1. Use a Google Cloud **Desktop app** OAuth 2.0 client. Reject Web application client-secret
   files and malformed downloads.
2. Use a standalone `npm run login` loopback flow. Do not auto-open a browser and do not add
   a dependency.
3. Replace all workload credential sources and delete the product-access bootstrap CLI.
4. Require absolute `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH` values. Do
   not silently choose a token path.
5. Request the deduplicated union of every runtime mode's scopes at login.
6. Keep `INCLUDE_PUBLISH_SCOPE=1` as the runtime opt-in for publish mode. It gates the
   operation, not the token's scopes; the stored refresh token is already publish-capable.
7. A successful re-login globally replaces the previous identity. A failed or cancelled
   re-login preserves the previous valid token.
8. Keep the public `buildAuth({ mode })` signature unchanged so GA4, GTM, and tool callers
   do not change.

## Accepted risks and explicit non-goals

- The local refresh token is plaintext JSON protected by file permissions (`0600`), not an
  operating-system keychain. Keychain integration is separate work.
- The stored refresh token has all read, write, version, and publish scopes. The runtime
  environment gate and the existing publish safety guards remain the barriers to live
  publish.
- Desktop client secrets are loaded from a local file. A Desktop client is a public OAuth
  client; its client secret is not treated as a server-side confidentiality boundary.
- DPoP, hardware-backed keys, token encryption at rest, multi-user token stores, remote
  deployment, URL elicitation, and CI authentication are not part of this feature.
- The operator's Google identity must already have the required GA4 property and GTM
  account/container access. This server does not grant product access.

## Public contracts and data shapes

### Environment

The runtime and login command require:

```dotenv
GOOGLE_OAUTH_CLIENT_SECRETS=/absolute/path/to/google-oauth-client.json
GOOGLE_OAUTH_TOKEN_PATH=/absolute/path/to/user-oauth-token.json
INCLUDE_PUBLISH_SCOPE=0
```

Both paths must be absolute and are required. `.env.example` documents placeholders only;
the repository does not add or edit a real `.env` file.

### Desktop client-secret input

Accept a downloaded Google Desktop client-secret document with this required shape:

```json
{
  "installed": {
    "client_id": "<OAUTH_CLIENT_ID>",
    "client_secret": "<OAUTH_CLIENT_SECRET>"
  }
}
```

The nested `installed` object may contain Google's normal additional fields. A document with
only `web`, missing/blank identifiers, invalid JSON, or an unreadable/non-regular file fails
with a redacted `PERMISSION_DENIED`.

### Stored token

Persist only:

```json
{
  "refresh_token": "<REFRESH_TOKEN>",
  "granted_scopes": [
    "https://www.googleapis.com/auth/analytics.readonly"
  ],
  "client_id": "<OAUTH_CLIENT_ID>",
  "obtained_at": "2026-07-28T12:00:00.000Z"
}
```

The Zod schema is strict:

- `refresh_token`, `client_id`, and `obtained_at` are non-empty;
- `obtained_at` is an ISO timestamp;
- `granted_scopes` is a non-empty array of unique non-empty strings;
- unknown fields are rejected;
- `client_id` must match the currently configured Desktop client.

Do not persist an access token, expiry, ID token, client secret, authorization code, PKCE
verifier, or OAuth state.

### `src/auth/userOAuth.ts`

Expose these responsibilities without recreating `credentialSource.ts`:

```ts
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

export function resolveUserOAuthPaths(
  env?: NodeJS.ProcessEnv,
): UserOAuthPaths;

export function readDesktopOAuthClient(
  path: string,
): DesktopOAuthClient;

export function readStoredUserOAuthToken(
  path: string,
  expectedClientId: string,
): StoredUserOAuthToken;

export function createUserOAuthClient(
  client: DesktopOAuthClient,
  token: StoredUserOAuthToken,
): InstanceType<typeof google.auth.OAuth2>;

export function loadUserOAuth(
  env?: NodeJS.ProcessEnv,
): {
  auth: InstanceType<typeof google.auth.OAuth2>;
  token: StoredUserOAuthToken;
  tokenPath: string;
};

export async function writeStoredUserOAuthToken(
  tokenPath: string,
  token: StoredUserOAuthToken,
): Promise<void>;
```

`createUserOAuthClient` configures `google.auth.OAuth2` with the refresh token only.

### `src/cli/login.ts`

Keep the CLI testable through dependency injection at the external boundary, not by
bypassing the loopback server:

```ts
type LoginDependencies = {
  createOAuth2Client: (
    client: DesktopOAuthClient,
    redirectUri: string,
  ) => {
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
  onAuthorizationUrl(url: string): void;
  now(): Date;
  timeoutMs: number;
};

export async function runLogin(options?: {
  env?: NodeJS.ProcessEnv;
  dependencies?: Partial<LoginDependencies>;
}): Promise<{
  tokenPath: string;
  grantedScopes: string[];
}>;
```

Production defaults:

- `createOAuth2Client` constructs `google.auth.OAuth2`;
- `onAuthorizationUrl` writes the consent URL once to stderr;
- `now` returns the current time;
- `timeoutMs` is `300_000` (five minutes).

The injected OAuth client is the only network stub in tests. Tests must send HTTP requests
to the real ephemeral loopback listener.

## Security behavior

### Scope construction

Keep the existing mode-specific arrays and add:

```ts
export const ALL_LOGIN_SCOPES: readonly string[] = [...new Set([
  ...READ_SCOPES,
  ...WRITE_WORKSPACE_SCOPES,
  ...VERSION_SCOPES,
  ...PUBLISH_SCOPES,
])];
```

Do not alias `ALL_LOGIN_SCOPES` to `PUBLISH_SCOPES`; `PUBLISH_SCOPES` currently lacks the
container-version edit scope.

Remove `GA4_ACCESS_BOOTSTRAP_SCOPES` and `GTM_ACCESS_BOOTSTRAP_SCOPES`.

### Loopback OAuth

The login flow must:

1. Load and validate the Desktop client secrets and both absolute environment paths.
2. Bind an HTTP listener to `127.0.0.1` on an ephemeral port.
3. Use the exact callback path `/oauth2/callback`.
4. Generate at least 32 bytes of cryptographically random, base64url OAuth `state`.
5. Call the existing Google OAuth client's `generateCodeVerifierAsync()` and use its
   `codeChallenge` with `code_challenge_method=S256`.
6. Generate a consent URL with:
   - `access_type=offline`;
   - `prompt=consent`;
   - `include_granted_scopes=false`;
   - `scope=ALL_LOGIN_SCOPES`;
   - the loopback redirect URI;
   - the random `state`;
   - the S256 `code_challenge`.
7. Print that URL exactly once to stderr. The URL necessarily contains the single-use state
   and challenge; do not separately log its query parameters.
8. Accept only `GET /oauth2/callback`.
9. Reject provider `error`, missing or duplicate `code`, missing or duplicate `state`, and a
   non-exact state match before token exchange.
10. Exchange the code with the original `codeVerifier` and the exact redirect URI.
11. Require a non-empty `refresh_token` and a non-empty OAuth response `scope` string.
12. Split and deduplicate the returned scope string, then require every
    `ALL_LOGIN_SCOPES` entry.
13. Persist only after all validation passes.
14. Return a minimal no-store browser success or failure response without identifiers or
    secrets.
15. Consume at most one valid callback, close the listener on every success or failure path,
    and reject after five minutes.

A provider denial, state failure, missing refresh token, partial grant, timeout, exchange
failure, or persistence failure must not alter an existing valid token.

### Atomic token replacement

`writeStoredUserOAuthToken` must:

1. Resolve the already-validated absolute destination.
2. Create a missing parent directory recursively with mode `0700`.
3. Leave permissions on an existing parent directory unchanged.
4. Refuse a destination that is a symbolic link or a non-regular existing file.
5. Serialize the strict stored-token shape with a trailing newline.
6. Create a random temporary file in the same directory with exclusive creation
   (`O_CREAT | O_EXCL | O_WRONLY`) and mode `0600`.
7. Write, sync, and close the temporary file before renaming it over the destination.
8. Remove the temporary file on every failure path.
9. Verify the final file is regular and mode `0600`.

Do not `chmod` an arbitrary pre-existing parent and do not write directly to the destination.

### Runtime refresh and error translation

`buildAuth({ mode })` must:

1. Check `INCLUDE_PUBLISH_SCOPE === "1"` before loading credentials for `publish`.
2. Load the OAuth context from `userOAuth.ts`.
3. Require the stored `granted_scopes` to cover the selected mode's scope array.
4. Call `await auth.getAccessToken()` once to prime or validate refresh before returning the
   client.
5. Convert a recognized Google `invalid_grant` into:

   ```text
   PERMISSION_DENIED: Google OAuth authorization expired or was revoked. Run npm run login.
   ```

6. Convert other refresh failures into a redacted `PERMISSION_DENIED` that says refresh
   failed and names `npm run login`; include only a stable non-secret reason code.

Never attach the raw Google error, response body, token, request URL, client secret, or
authorization code to `MCPError.details` or logger metadata.

The publish error must say publish **mode** requires `INCLUDE_PUBLISH_SCOPE=1`; it must not
imply that the environment variable adds scopes to the already broad token.

## What exactly changes

### Add

- `src/auth/userOAuth.ts`
- `src/cli/login.ts`
- `tests/auth.userOAuth.test.ts`
- `tests/cli.login.test.ts`

### Edit

- `src/auth/scopes.ts`
- `src/auth/googleAuth.ts`
- `tests/auth.test.ts`
- `tests/server.boot.test.ts`
- `package.json`
- `.env.example`
- `README.md`
- `docs/setup/README.md`
- `docs/setup/google-cloud-credentials.md`
- `docs/setup/application-project-integration.md`
- `docs/setup/mcp-client-configuration.md`
- `AGENTS.md` sections 10 and 11, only after the feature ships
- `docs/agents/features/EXECUTED-2026-05-28-build-mcp-server.md`, Current Accuracy only
- this plan, renamed to `EXECUTED-user-oauth-auth.md` when complete

### Rename

- `docs/setup/product-access-bootstrap.md` to `docs/setup/user-oauth-login.md`
- `docs/agents/bugfixes/EXECUTED-2026-05-29-service-account-bootstrap-auth.md` to
  `docs/agents/bugfixes/OBSOLETE-2026-05-29-service-account-bootstrap-auth.md`

The obsolete bootstrap artifact must change its top-level `Status:` to `obsolete` and state
that user OAuth superseded its runtime/bootstrap direction. The historical build artifact
remains executed; add a concise Current Accuracy note that its workload-auth description was
superseded.

### Delete

- `src/auth/credentialSource.ts`
- `src/cli/bootstrapAccess.ts`
- `src/bootstrap/accessBootstrap.ts`
- `tests/auth.credentialSource.test.ts`
- `tests/bootstrap.cli.test.ts`
- `tests/bootstrap.ga4Access.test.ts`
- `tests/bootstrap.gtmAccess.test.ts`
- the `bootstrap:access` package script
- the empty `src/bootstrap/` directory

### Package script

Add exactly:

```json
"login": "npm run build && node dist/cli/login.js"
```

No dependency or lockfile change is expected.

## Forbidden regressions

- Do not change the 12 MCP tool names, descriptions, input contracts, or safety metadata.
- Do not change `src/tools/`, `src/ga4/`, `src/gtm/`, planner logic, spec schemas, or safety
  guards.
- Do not weaken the PII, secret, UA-era, per-event-tag, consent, workspace, destructive,
  version, approval-token, or publish guards.
- Do not allow publish mode without `INCLUDE_PUBLISH_SCOPE=1`.
- Do not store or log access tokens, ID tokens, authorization codes, PKCE verifiers, OAuth
  states outside the one displayed consent URL, refresh tokens, or client secrets.
- Do not write OAuth material to `.audit/`.
- Do not add a default relative token path, mutate `.env`, or commit local MCP registration.
- Do not add a new runtime dependency or shell out to `gcloud`.
- Do not retain a compatibility branch for workload credentials.
- Do not add a fake callback/code-source seam that lets tests skip the loopback listener.
- Do not add MCP URL elicitation as part of this feature.

## Files allowed to touch

```text
src/auth/scopes.ts
src/auth/googleAuth.ts
src/auth/userOAuth.ts
src/auth/credentialSource.ts                         (delete)
src/cli/login.ts
src/cli/bootstrapAccess.ts                          (delete)
src/bootstrap/accessBootstrap.ts                    (delete)
tests/auth.test.ts
tests/auth.userOAuth.test.ts
tests/auth.credentialSource.test.ts                  (delete)
tests/cli.login.test.ts
tests/server.boot.test.ts
tests/bootstrap.cli.test.ts                         (delete)
tests/bootstrap.ga4Access.test.ts                    (delete)
tests/bootstrap.gtmAccess.test.ts                    (delete)
package.json
.env.example
README.md
docs/setup/README.md
docs/setup/google-cloud-credentials.md
docs/setup/application-project-integration.md
docs/setup/mcp-client-configuration.md
docs/setup/product-access-bootstrap.md               (rename)
docs/setup/user-oauth-login.md                       (renamed target)
AGENTS.md                                            (sections 10 and 11 only)
docs/agents/bugfixes/EXECUTED-2026-05-29-service-account-bootstrap-auth.md
docs/agents/bugfixes/OBSOLETE-2026-05-29-service-account-bootstrap-auth.md
docs/agents/features/EXECUTED-2026-05-28-build-mcp-server.md
docs/agents/features/PLANNED-user-oauth-auth.md       (rename on completion)
docs/agents/features/EXECUTED-user-oauth-auth.md      (renamed target)
```

If implementation requires any other file, update this plan and obtain review before
touching it.

## Implementation tasks

### Task 1: Correct the login scope set

**Files**

- Modify: `src/auth/scopes.ts`
- Modify: `tests/auth.test.ts`

**Steps**

- [ ] Replace the bootstrap-scope assertions with a failing test for
      `ALL_LOGIN_SCOPES`.
- [ ] Assert the union contains every member of `READ_SCOPES`,
      `WRITE_WORKSPACE_SCOPES`, `VERSION_SCOPES`, and `PUBLISH_SCOPES`.
- [ ] Assert the union contains no duplicates and excludes both old user-management
      bootstrap scopes.
- [ ] Add the deduplicated union and remove the two bootstrap exports.
- [ ] Run `npm test -- tests/auth.test.ts` and confirm it passes.
- [ ] Run `npm run typecheck`.
- [ ] Commit only these files:

  ```bash
  git add src/auth/scopes.ts tests/auth.test.ts
  git commit -m "feat(auth): define complete user OAuth scope union"
  ```

### Task 2: Add the validated OAuth/token module

**Files**

- Create: `src/auth/userOAuth.ts`
- Create: `tests/auth.userOAuth.test.ts`

**Steps**

- [ ] Write failing tests for missing, relative, and blank environment paths.
- [ ] Write failing tests for valid Desktop secrets; invalid JSON; a Web-only client;
      missing identifiers; unreadable paths; and non-regular files.
- [ ] Write failing tests for valid stored tokens; unknown/missing fields; invalid timestamp;
      duplicate/empty scopes; client-ID mismatch; symlink destination; and non-regular
      destination.
- [ ] Write a failing test proving `createUserOAuthClient` sets only the refresh token.
- [ ] Write failing atomic-write tests proving:
      - a missing parent is created;
      - the final file is `0600`;
      - only the four allowed keys are stored;
      - a previous valid token survives a mocked `rename` failure;
      - temporary files are cleaned up.
- [ ] Implement the public contracts and secure persistence behavior defined above.
- [ ] Use `MCPError("PERMISSION_DENIED", ...)` with stable redacted reasons for every
      configuration/token failure.
- [ ] Run `npm test -- tests/auth.userOAuth.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Commit:

  ```bash
  git add src/auth/userOAuth.ts tests/auth.userOAuth.test.ts
  git commit -m "feat(auth): add secure user OAuth token store"
  ```

### Task 3: Replace runtime auth and remove credential-source abstraction

**Files**

- Modify: `src/auth/googleAuth.ts`
- Modify: `tests/auth.test.ts`
- Delete: `src/auth/credentialSource.ts`
- Delete: `tests/auth.credentialSource.test.ts`

**Steps**

- [ ] Replace workload-auth tests with failing tests for read, write, version, and publish
      scope assertions using a mocked `userOAuth.ts` boundary.
- [ ] Keep a failing test that publish mode rejects before credential loading when
      `INCLUDE_PUBLISH_SCOPE` is absent.
- [ ] Add tests proving `INCLUDE_PUBLISH_SCOPE=1` enables publish mode but does not change
      the token scope set.
- [ ] Add tests proving a partial stored grant rejects each affected mode with
      `PERMISSION_DENIED` and `npm run login`.
- [ ] Add tests proving `getAccessToken()` is called before `buildAuth` returns.
- [ ] Add tests for redacted `invalid_grant` and generic refresh failures; assert raw
      provider values are absent from the serialized error.
- [ ] Rewrite `buildAuth` to use `loadUserOAuth`, preserve its public signature, and return
      `google.auth.OAuth2`.
- [ ] Delete `credentialSource.ts` and its tests; do not replace them with a one-literal
      credential source.
- [ ] Run `npm test -- tests/auth.test.ts tests/auth.userOAuth.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Commit:

  ```bash
  git add src/auth/googleAuth.ts tests/auth.test.ts
  git add src/auth/credentialSource.ts tests/auth.credentialSource.test.ts
  git commit -m "feat(auth): replace workload runtime credentials"
  ```

### Task 4: Implement the hardened loopback login

**Files**

- Create: `src/cli/login.ts`
- Create: `tests/cli.login.test.ts`
- Modify: `package.json`

**Steps**

- [ ] Write the CLI tests first using a stub OAuth client and the real loopback listener.
- [ ] In the success test, let `onAuthorizationUrl` parse the generated redirect URI,
      `state`, and `code_challenge`, then send a real HTTP `GET` callback to the ephemeral
      listener.
- [ ] Assert a non-empty S256 challenge is present and the corresponding verifier is passed
      to `getToken`.
- [ ] Cover matching, missing, duplicate, and mismatched state; missing/duplicate code;
      provider denial; wrong method; wrong path; timeout; partial scopes; missing refresh
      token; token-exchange failure; and listener closure.
- [ ] Prove only one valid callback is consumed.
- [ ] Pre-create a valid token, fail a re-login after callback, and prove the file is
      unchanged.
- [ ] Capture stderr and assert it contains the authorization URL exactly once but contains
      no refresh token, authorization code, PKCE verifier, or client secret.
- [ ] Implement the five-minute, state-bound, PKCE S256 loopback flow.
- [ ] Return minimal browser HTML/text with `Cache-Control: no-store`; do not echo query
      values.
- [ ] Add exactly `"login": "npm run build && node dist/cli/login.js"` to package scripts.
- [ ] Run `npm test -- tests/cli.login.test.ts tests/auth.userOAuth.test.ts`.
- [ ] Run `npm run build`.
- [ ] Commit:

  ```bash
  git add src/cli/login.ts tests/cli.login.test.ts package.json
  git commit -m "feat(auth): add hardened user OAuth login"
  ```

### Task 5: Remove bootstrap implementation and protect the server contract

**Files**

- Delete: `src/cli/bootstrapAccess.ts`
- Delete: `src/bootstrap/accessBootstrap.ts`
- Delete: `tests/bootstrap.cli.test.ts`
- Delete: `tests/bootstrap.ga4Access.test.ts`
- Delete: `tests/bootstrap.gtmAccess.test.ts`
- Modify: `package.json`
- Modify: `tests/server.boot.test.ts`

**Steps**

- [ ] Delete the bootstrap modules and tests and remove `bootstrap:access`.
- [ ] Remove the empty `src/bootstrap/` directory.
- [ ] Strengthen `tests/server.boot.test.ts` so unset OAuth paths do not prevent server
      construction, the exact same 12 tools register, and all safety metadata still passes.
- [ ] Run the existing spec-only test files with OAuth variables unset:

  ```bash
  env -u GOOGLE_OAUTH_CLIENT_SECRETS -u GOOGLE_OAUTH_TOKEN_PATH \
    npm test -- tests/server.boot.test.ts tests/spec.read.test.ts \
    tests/spec.validation.test.ts tests/spec.summarize.test.ts
  ```

- [ ] Run `npm run build`.
- [ ] Run `npm test`.
- [ ] Commit:

  ```bash
  git add src/cli/bootstrapAccess.ts src/bootstrap/accessBootstrap.ts
  git add tests/bootstrap.cli.test.ts tests/bootstrap.ga4Access.test.ts
  git add tests/bootstrap.gtmAccess.test.ts tests/server.boot.test.ts package.json
  git commit -m "refactor(auth): remove product-access bootstrap"
  ```

### Task 6: Rewrite setup, migration, and historical documentation

**Files**

- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/setup/README.md`
- Modify: `docs/setup/google-cloud-credentials.md`
- Modify: `docs/setup/application-project-integration.md`
- Rename/rewrite: `docs/setup/product-access-bootstrap.md` to
  `docs/setup/user-oauth-login.md`
- Modify: `docs/setup/mcp-client-configuration.md`
- Modify: `AGENTS.md` sections 10 and 11
- Rename/update:
  `docs/agents/bugfixes/EXECUTED-2026-05-29-service-account-bootstrap-auth.md`
- Modify Current Accuracy:
  `docs/agents/features/EXECUTED-2026-05-28-build-mcp-server.md`

**Required documentation content**

- [ ] Separate Google Cloud OAuth client setup from GA4/GTM product access.
- [ ] State that the operator's user account must already have the intended GA4 and GTM
      permissions.
- [ ] Document Desktop client creation, absolute paths, `npm run login`, token replacement,
      `0600` storage, re-login, and revocation/`invalid_grant` recovery.
- [ ] Explain `INCLUDE_PUBLISH_SCOPE` as an operation gate, not a scope-acquisition switch.
- [ ] Explain the accepted plaintext-token and all-scopes risks.
- [ ] Explain Google OAuth audience/publishing choices:
      - Internal is available only to a Google Workspace organization;
      - External in Testing requires test users and non-basic refresh tokens expire after
        seven days;
      - a durable one-time local login needs an eligible Internal app or an External app
        configured for In production;
      - verification requirements, unverified-app warnings, and user caps depend on the
        audience and requested scopes and must follow Google's current policy.
- [ ] Link Google's current guidance:
      - [OAuth overview and refresh-token expiration](https://developers.google.com/identity/protocols/oauth2)
      - [OAuth app audience and seven-day Testing behavior](https://support.google.com/cloud/answer/15549945)
- [ ] Use absolute placeholders in all MCP configuration examples.
- [ ] Remove the old runtime statement that user refresh-token OAuth is unsupported.
- [ ] Do not add a real `.env`, client-secret file, token file, email, project ID, property
      ID, account ID, container ID, or machine path.
- [ ] Update root `AGENTS.md` only now that the implementation exists:
      - change section 10 auth layout/facts;
      - remove obsolete workload/impersonation learnings;
      - add concise rules for the user-OAuth model, absolute paths, all-scope token, and
        publish-mode gate.
- [ ] Mark the service-account bootstrap artifact obsolete and update its Outcome/Current
      Accuracy.
- [ ] Keep the build-server artifact historical and add only the supersession note.
- [ ] Review every changed canonical doc against the `docs/AGENTS.md` UI/UX wording,
      backend/API, security/privacy, and architecture/contracts criteria.

**Verification**

- [ ] Confirm canonical source/docs have no workload or bootstrap configuration:

  ```bash
  rg -n \
    "GOOGLE_APPLICATION_CREDENTIALS|ALLOW_GOOGLE_METADATA_AUTH|ALLOW_GOOGLE_IMPERSONATED_ADC|bootstrap:access" \
    README.md .env.example docs/setup src package.json
  ```

  Expected result: no matches.

- [ ] Confirm `src/auth/` has no workload-source implementation:

  ```bash
  rg -n \
    "service_account|external_account|impersonated|metadata|authorized_user|GoogleAuth|Compute" \
    src/auth
  ```

  Expected result: no matches. Historical artifacts are intentionally excluded.

- [ ] Confirm every setup link resolves and the obsolete/planned filenames are not linked
      as current guidance.
- [ ] Commit:

  ```bash
  git add .env.example README.md docs/setup AGENTS.md docs/agents
  git commit -m "docs(auth): replace workload setup with user OAuth"
  ```

### Task 7: Full verification and manual local acceptance

**Automated verification**

- [x] Run:

  ```bash
  npm run typecheck
  npm run build
  npm test
  git diff --check
  git status --short
  ```

- [x] Confirm the full suite is green and the only changed files are in this plan.
- [x] Confirm `.secrets/`, `dist/`, `.env`, client secrets, and the token file are not
      tracked.
- [x] Confirm all 12 tools and every safety guard test remain green.

**Manual OAuth verification**

Use private local values only; do not add them to the repository.

- [ ] Configure an eligible Internal or In-production External consent screen and create a
      Desktop OAuth client.
- [ ] Set absolute local values for `GOOGLE_OAUTH_CLIENT_SECRETS` and
      `GOOGLE_OAUTH_TOKEN_PATH`.
- [ ] Run `npm run login`, complete consent, and verify the result file is regular and mode
      `0600`.
- [ ] Inspect only the token object's key names, client-ID equality, timestamp, and granted
      scope list. Do not print the refresh-token value.
- [ ] Confirm the granted scopes equal the deduplicated union, including
      `tagmanager.edit.containerversions` and `tagmanager.publish`.
- [ ] With `INCLUDE_PUBLISH_SCOPE` unset, confirm a publish-mode auth attempt fails locally
      before a Google request.
- [ ] Through the MCP client, read one private placeholder property
      `properties/<GA4_PROPERTY_ID>` and one private placeholder GTM container under
      `accounts/<GTM_ACCOUNT_ID>/containers/<GTM_CONTAINER_ID>`.
- [x] Do not perform a live write or publish as part of acceptance.
- [ ] Verify the local registration separately with:

  ```bash
  claude mcp get ga4-gtm-config
  ```

  Local MCP registration is operator state, not a repository file or commit.

**Artifact completion**

- [x] Rename this plan to `docs/agents/features/EXECUTED-user-oauth-auth.md`.
- [x] Change `Status:` to `executed`.
- [x] Add `Outcome` and `Current Accuracy` with the exact verification results and any
      implementation divergence.
- [x] Record which `docs/AGENTS.md` review dimensions were checked.
- [x] Commit:

  ```bash
  git add docs/agents/features
  git commit -m "docs(auth): record user OAuth implementation outcome"
  ```

## Expected behavior

- Before login, every operation that needs Google fails with a redacted
  `PERMISSION_DENIED` naming `npm run login`.
- Before login, server construction and the read/validate/summarize spec functions remain
  usable because they do not call Google.
- `npm run login` displays one consent URL, completes a state-bound PKCE loopback flow,
  validates the full grant, and atomically replaces the token.
- A cancelled or failed login leaves the prior token intact.
- After login, Google API calls run under the most recently authorized operator identity.
- A revoked, expired, or otherwise invalid refresh token fails with a redacted re-login
  instruction.
- Publish mode still fails closed without `INCLUDE_PUBLISH_SCOPE=1`.
- Enabling publish mode does not bypass approval tokens, the spec-level publish flag, or any
  existing publish guard.

## Acceptance criteria

- [x] `npm run typecheck`, `npm run build`, `npm test`, and `git diff --check` pass.
- [x] `ALL_LOGIN_SCOPES` is the unique union of all four runtime scope arrays and includes
      the container-version edit scope.
- [x] `credentialSource.ts`, workload branches, bootstrap implementation, bootstrap tests,
      and `bootstrap:access` are gone.
- [x] Both OAuth paths are required and absolute; Desktop client secrets and stored tokens
      are strictly validated.
- [x] The loopback flow uses `127.0.0.1`, an ephemeral port, exact path/method checks, random
      single-use state, PKCE S256, one valid callback, and a five-minute timeout.
- [x] Tests exercise the real HTTP listener while stubbing only Google OAuth exchange.
- [x] Failed re-login preserves the existing token.
- [x] The token file contains only the four allowed fields, is atomically replaced, is
      regular, and is mode `0600`.
- [x] Runtime validates granted scopes, primes token refresh, and redacts `invalid_grant`.
- [x] No secret, code, verifier, token, or raw provider error reaches stderr, audit logs,
      errors, fixtures, or git. The displayed authorization URL is the sole intentional
      state/challenge output.
- [x] The exact same 12 MCP tools and all safety gates remain unchanged.
- [x] Canonical setup docs contain no workload-credential/bootstrap configuration and
      accurately explain Google's seven-day Testing behavior.
- [x] MCP URL elicitation is documented as technically supported but deferred; the plan
      does not justify the CLI with a false MCP limitation.
- [ ] Manual GA4 and GTM reads succeed under placeholder private resources; no live write or
      publish is required.

## Cross-references

- Current auth: `src/auth/scopes.ts`, `src/auth/googleAuth.ts`,
  `src/auth/userOAuth.ts`
- Server contract: `src/server.ts`, `tests/server.boot.test.ts`
- Error contract: `src/utils/errors.ts`
- Redaction helper: `src/utils/redact.ts`
- Setup-doc rules: `docs/AGENTS.md`
- Superseded bootstrap record:
  `../bugfixes/OBSOLETE-2026-05-29-service-account-bootstrap-auth.md`
- Historical server plan: `EXECUTED-2026-05-28-build-mcp-server.md`
