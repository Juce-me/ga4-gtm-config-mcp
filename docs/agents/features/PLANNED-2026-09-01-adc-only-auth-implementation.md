# ADC-Only Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: planned
Type: feature
Author: Juce

**Goal:** Make standard Google Application Default Credentials the server's only GA4/GTM authentication source while retaining `npm run login` as a projectless gcloud ADC-login helper.

**Architecture:** `buildAuth` delegates credential discovery to `google.auth.GoogleAuth`, selects only the scopes required by the operation mode, and validates the resolved client with one token request. The package login script delegates credential acquisition to `gcloud auth application-default login`; the repository no longer parses client JSON, stores refresh tokens, or requires a Google Cloud project ID.

**Tech Stack:** TypeScript 5.9, Node.js 20+, ESM/NodeNext, `googleapis` 172.0.0, Vitest 3.2.4, npm, gcloud CLI.

**Source design:** [PLANNED-2026-09-01-adc-only-auth-design.md](PLANNED-2026-09-01-adc-only-auth-design.md)

**Commit policy:** The current request does not authorize commits. Run each checkpoint and inspect the diff, but do not commit until the user explicitly requests it.

---

## File Map

- `src/auth/googleAuth.ts`: the only runtime authentication boundary; resolve and validate ADC.
- `src/auth/scopes.ts`: retain the four runtime scope tiers and their deduplicated union.
- `package.json`: make `npm run login` invoke gcloud ADC login with no quota project.
- `tests/auth.test.ts`: prove exact mode scopes, publish gating, token validation, and secret-safe failures.
- `tests/login.adc.test.ts`: prove the package login contract without starting an interactive browser flow.
- `tests/server.boot.test.ts`: prove server registration remains lazy and does not require credential-path variables at boot.
- `src/auth/userOAuth.ts`, `src/cli/login.ts`, `tests/auth.userOAuth.test.ts`, `tests/cli.login.test.ts`: remove the obsolete private OAuth credential format and loopback implementation.
- `.env.example`, `README.md`, `docs/setup/*.md`: replace active Desktop-client instructions with the ADC-only operator flow and migration guidance.
- `AGENTS.md`: update durable project instructions to match the new authentication contract.
- `docs/agents/features/PLANNED-2026-09-01-adc-only-auth-*.md`: track execution status and final outcome.

### Task 1: Replace Runtime OAuth Tests With ADC Tests

**Files:**
- Modify: `tests/auth.test.ts`
- Test: `tests/auth.test.ts`

- [ ] **Step 1: Replace the Desktop-token mock with a GoogleAuth boundary mock**

Keep the existing scope-constant assertions. Replace the `userOAuth` module mock and stored-token helpers with this setup:

```ts
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

const authClient = { getAccessToken: getAccessTokenMock };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "");
  getAccessTokenMock.mockResolvedValue({ token: "access-token-placeholder" });
  getClientMock.mockResolvedValue(authClient);
  googleAuthConstructorMock.mockImplementation(() => ({
    getClient: getClientMock,
  }));
});
```

- [ ] **Step 2: Add failing tests for exact ADC scope selection and eager token validation**

Use the existing `MODE_SCOPES` table and add:

```ts
it.each(Object.entries(MODE_SCOPES))(
  "resolves ADC with exactly the %s mode scopes and validates one token",
  async (mode, requiredScopes) => {
    if (mode === "publish") vi.stubEnv("INCLUDE_PUBLISH_SCOPE", "1");

    await expect(buildAuth({ mode: mode as AuthMode })).resolves.toBe(authClient);

    expect(googleAuthConstructorMock).toHaveBeenCalledOnce();
    expect(googleAuthConstructorMock).toHaveBeenCalledWith({
      scopes: [...requiredScopes],
    });
    expect(getClientMock).toHaveBeenCalledOnce();
    expect(getAccessTokenMock).toHaveBeenCalledOnce();
  },
);

it("waits for access-token validation before returning the ADC client", async () => {
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
  await expect(pending).resolves.toBe(authClient);
});
```

- [ ] **Step 3: Add failing tests for publish short-circuiting and redacted ADC failures**

Define these provider fixtures at module scope immediately before the failure table so both cases use the same secret-shaped values:

```ts
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
```

Add these assertions:

```ts
it("rejects publish mode before ADC discovery when INCLUDE_PUBLISH_SCOPE is absent", async () => {
  await expect(buildAuth({ mode: "publish" })).rejects.toMatchObject({
    code: "PERMISSION_DENIED",
    message: "Publish mode requires INCLUDE_PUBLISH_SCOPE=1.",
  });
  expect(googleAuthConstructorMock).not.toHaveBeenCalled();
  expect(getClientMock).not.toHaveBeenCalled();
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
    message: "Google Application Default Credentials are unavailable or invalid. Run npm run login or configure valid ADC.",
    details: { reason: "adc_unavailable" },
  });
  for (const value of providerValues) expect(serialized).not.toContain(value);
});
```

- [ ] **Step 4: Run the focused test and confirm it fails for the old OAuth implementation**

Run:

```bash
npx vitest run tests/auth.test.ts
```

Expected: FAIL because `buildAuth` still imports `loadUserOAuth`, never constructs `GoogleAuth`, and returns the old Desktop OAuth client.

### Task 2: Implement the ADC Authentication Boundary

**Files:**
- Modify: `src/auth/googleAuth.ts`
- Test: `tests/auth.test.ts`

- [ ] **Step 1: Replace `loadUserOAuth` with GoogleAuth ADC resolution**

Make `src/auth/googleAuth.ts` contain this behavior:

```ts
import { google } from "googleapis";
import {
  READ_SCOPES,
  WRITE_WORKSPACE_SCOPES,
  VERSION_SCOPES,
  PUBLISH_SCOPES,
} from "./scopes.js";
import { MCPError } from "../utils/errors.js";

export type AuthMode = "read" | "write" | "version" | "publish";

type GoogleAuthClient = Awaited<
  ReturnType<InstanceType<typeof google.auth.GoogleAuth>["getClient"]>
>;

function requiredScopes(mode: AuthMode): readonly string[] {
  if (mode === "read") return READ_SCOPES;
  if (mode === "write") return WRITE_WORKSPACE_SCOPES;
  if (mode === "version") return VERSION_SCOPES;
  return PUBLISH_SCOPES;
}

export async function buildAuth(
  opts: { mode: AuthMode },
): Promise<GoogleAuthClient> {
  if (opts.mode === "publish" && process.env.INCLUDE_PUBLISH_SCOPE !== "1") {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Publish mode requires INCLUDE_PUBLISH_SCOPE=1.",
    );
  }

  try {
    const googleAuth = new google.auth.GoogleAuth({
      scopes: [...requiredScopes(opts.mode)],
    });
    const auth = await googleAuth.getClient();
    await auth.getAccessToken();
    return auth;
  } catch {
    throw new MCPError(
      "PERMISSION_DENIED",
      "Google Application Default Credentials are unavailable or invalid. Run npm run login or configure valid ADC.",
      { reason: "adc_unavailable" },
    );
  }
}
```

- [ ] **Step 2: Run the focused tests**

Run:

```bash
npx vitest run tests/auth.test.ts
```

Expected: PASS; all four modes use exact scopes, publish short-circuits, token validation is awaited once, and provider values are absent from serialized errors.

- [ ] **Step 3: Type-check the new client type against GA4 and GTM callers**

Run:

```bash
npm run typecheck
```

Expected: PASS, including `google.analyticsadmin({ auth })` and `google.tagmanager({ auth })`. If GoogleAuth's inferred union is rejected by either generated API client, use the exported auth type accepted by both generated clients; do not cast to `OAuth2Client` because ADC can resolve non-user credential types.

- [ ] **Step 4: Inspect the checkpoint instead of committing**

Run:

```bash
git diff --check
git diff -- src/auth/googleAuth.ts tests/auth.test.ts
```

Expected: no whitespace errors; only the ADC boundary and its tests changed.

### Task 3: Make `npm run login` Provision ADC

**Files:**
- Create: `tests/login.adc.test.ts`
- Modify: `package.json`
- Delete: `src/cli/login.ts`
- Delete: `tests/cli.login.test.ts`
- Delete: `src/auth/userOAuth.ts`
- Delete: `tests/auth.userOAuth.test.ts`
- Modify: `tests/server.boot.test.ts`
- Test: `tests/login.adc.test.ts`
- Test: `tests/server.boot.test.ts`

- [ ] **Step 1: Add a failing package-script contract test**

Create `tests/login.adc.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_LOGIN_SCOPES } from "../src/auth/scopes.js";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

type PackageJson = {
  scripts: Record<string, string>;
};

describe("ADC login command", () => {
  it("uses gcloud ADC login with no quota project and the complete runtime scope union", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageJson;
    const command = packageJson.scripts.login;

    expect(command).toBeDefined();
    expect(command).toMatch(/^gcloud auth application-default login /u);
    expect(command).toContain("--disable-quota-project");
    expect(command).not.toContain("--client-id-file");
    expect(command).not.toContain("GOOGLE_OAUTH_");

    const scopeArgument = /--scopes=([^\s]+)/u.exec(command ?? "");
    expect(scopeArgument).not.toBeNull();
    const requestedScopes = scopeArgument?.[1]?.split(",") ?? [];
    expect(new Set(requestedScopes)).toEqual(
      new Set([CLOUD_PLATFORM_SCOPE, ...ALL_LOGIN_SCOPES]),
    );
  });
});
```

- [ ] **Step 2: Run the login contract test and verify it fails**

Run:

```bash
npx vitest run tests/login.adc.test.ts
```

Expected: FAIL because the current script builds and runs `dist/cli/login.js`.

- [ ] **Step 3: Replace the package login script with the exact gcloud ADC command**

Set `scripts.login` in `package.json` to:

```json
"login": "gcloud auth application-default login --disable-quota-project --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/tagmanager.readonly,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/tagmanager.edit.containers,https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/tagmanager.edit.containerversions,https://www.googleapis.com/auth/tagmanager.publish"
```

Do not add a project flag or `--client-id-file`.

- [ ] **Step 4: Remove the obsolete private OAuth implementation and tests**

Delete exactly:

```text
src/auth/userOAuth.ts
src/cli/login.ts
tests/auth.userOAuth.test.ts
tests/cli.login.test.ts
```

Do not delete any operator credential files outside the repository.

- [ ] **Step 5: Make the server boot test credential-source neutral**

Replace the test body in `tests/server.boot.test.ts` with:

```ts
it("constructs without resolving ADC and retains the full safe tool catalog", () => {
  const { tools } = buildServer();
  expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOL_NAMES);
  expect(() => assertSafeToolMetadata(tools)).not.toThrow();
});
```

Remove unused `afterEach` and `vi` imports. Server construction must remain lazy; ADC is resolved only when a Google-backed tool is called.

- [ ] **Step 6: Run the focused login, auth, and boot tests**

Run:

```bash
npx vitest run tests/login.adc.test.ts tests/auth.test.ts tests/server.boot.test.ts
```

Expected: PASS.

- [ ] **Step 7: Prove no runtime source references the removed credential format**

Run:

```bash
rg -n "userOAuth|GOOGLE_OAUTH_CLIENT_SECRETS|GOOGLE_OAUTH_TOKEN_PATH|dist/cli/login" src tests package.json
```

Expected: no matches.


### Task 4: Update the Root Operator Contract

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Test: documentation search checks

- [ ] **Step 1: Replace `.env.example` with the ADC-only environment contract**

Use:

```dotenv
# ga4-gtm-config-mcp — optional environment configuration.
# Copy to `.env` (gitignored) only if your launcher loads it. Never commit real values.

# Optional absolute path to a non-default ADC file. Leave unset to use standard
# Application Default Credentials discovery, including the well-known gcloud ADC.
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/private/application-default-credentials.json

# This flag does not acquire OAuth scopes. It only permits the runtime to attempt
# publish-mode operations. Leave unset unless publishing is explicitly approved.
INCLUDE_PUBLISH_SCOPE=

# No Google Cloud project ID is required at runtime. GA4/GTM target IDs are
# explicit tool arguments and spec fields, not environment variables.
```

- [ ] **Step 2: Rewrite README setup, configuration, limitations, and troubleshooting**

Make this the canonical short setup flow:

```markdown
1. Install the gcloud CLI and authenticate the Google user that already has the required GA4/GTM product roles.
2. Run `npm run login` and keep it active while browser authorization completes. The command writes standard ADC and does not require a quota project.
3. Run `npm run build`, then configure the MCP host with the absolute Node and `dist/server.js` paths.
4. Leave `GOOGLE_APPLICATION_CREDENTIALS` unset to use the well-known local ADC, or set it to an absolute path for another ADC source.
5. Leave `INCLUDE_PUBLISH_SCOPE` unset unless publishing is explicitly approved.
```

Use an MCP JSON example with only `command` and `args`; add an optional environment example separately:

```json
{
  "env": {
    "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/private/application-default-credentials.json"
  }
}
```

Use this troubleshooting distinction:

```markdown
- **ADC is unavailable or invalid** — run `npm run login`, or configure a valid standard ADC source with `GOOGLE_APPLICATION_CREDENTIALS`, then restart the MCP host.
- **GA4/GTM returns `PERMISSION_DENIED` or a target is not visible** — the ADC identity lacks the required product role or the target ID is wrong. OAuth scopes and ADC do not add GA4/GTM product access.
```

State once, near login instructions, that gcloud currently warns its built-in OAuth client may stop accepting custom Analytics scopes; service-account impersonation or another externally provisioned ADC remains compatible. Remove active claims about private repo token storage, Desktop clients, testing-app seven-day tokens, and OAuth client path validation.

- [ ] **Step 3: Check the root docs for forbidden active instructions**

Run:

```bash
rg -n "GOOGLE_OAUTH_CLIENT_SECRETS|GOOGLE_OAUTH_TOKEN_PATH|create a Desktop client|stored token|dist/cli/login" README.md .env.example
```

Expected: no matches.

### Task 5: Rewrite Focused Setup Guides Around ADC

**Files:**
- Modify: `docs/setup/README.md`
- Modify: `docs/setup/google-cloud-credentials.md`
- Modify: `docs/setup/user-oauth-login.md`
- Modify: `docs/setup/mcp-client-configuration.md`
- Modify: `docs/setup/application-project-integration.md`
- Test: documentation search checks

- [ ] **Step 1: Establish the same four boundaries in every setup guide**

Use this terminology consistently:

```markdown
| Item | Purpose | What it does not do |
|---|---|---|
| ADC | Supplies a Google identity and OAuth scopes to Google Auth Library | Does not grant GA4 property or GTM account/container roles |
| Operator identity | Holds the existing GA4/GTM product permissions | Does not require a runtime Google Cloud project ID |
| MCP host | Starts the local stdio server | Does not acquire or store Google credentials for the server |
| Execution spec | Declares reviewed desired state and target resources | Never contains credentials or secret values |
```

The canonical flow is:

```bash
npm install
npm run login
npm run build
```

Explain that `npm run login` delegates to `gcloud auth application-default login --disable-quota-project` with the complete runtime scope union, stays active during browser authorization, and writes to gcloud's standard ADC location.

- [ ] **Step 2: Give each existing guide one clear responsibility**

Rewrite without renaming files:

- `docs/setup/README.md`: end-to-end setup order, trust boundaries, migration from the removed `GOOGLE_OAUTH_*` variables.
- `docs/setup/google-cloud-credentials.md`: explain ADC sources, optional `GOOGLE_APPLICATION_CREDENTIALS`, service-account impersonation, scope acquisition, and the fact that no project ID is a runtime GA4/GTM input.
- `docs/setup/user-oauth-login.md`: document `npm run login`, expected browser interaction, gcloud's custom-scope warning, recovery, and how to verify ADC with `gcloud auth application-default print-access-token` without printing the token into logs.
- `docs/setup/mcp-client-configuration.md`: show absolute Node and server entrypoint paths; omit an env block for well-known ADC and show only optional `GOOGLE_APPLICATION_CREDENTIALS` plus the separately gated `INCLUDE_PUBLISH_SCOPE`.
- `docs/setup/application-project-integration.md`: keep credentials outside application repos, pass only reviewed spec paths and target arguments, and state that application project configuration does not select runtime Google credentials.

Use this projectless runtime statement verbatim in the overview and credentials guide:

```markdown
The server does not read or require a Google Cloud project ID for GA4 Admin or GTM API calls. ADC supplies the identity; OAuth scopes authorize API capabilities; existing GA4/GTM product roles authorize access to the target resources.
```

- [ ] **Step 3: Run the complete active-documentation search**

Run:

```bash
rg -n "GOOGLE_OAUTH_CLIENT_SECRETS|GOOGLE_OAUTH_TOKEN_PATH|Desktop OAuth|Desktop client|repository-specific refresh token" README.md .env.example docs/setup AGENTS.md
```

Expected: no active instructions remain. A migration sentence may name the removed `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH` variables only to tell operators to delete them; phrase the search exception explicitly and inspect it manually.

- [ ] **Step 4: Check documentation against the project review criteria**

Record these findings for the final artifact:

```text
UI/UX wording and flow: applicable; first-time ADC setup and recovery are end-to-end and use one canonical term per concept.
Backend/API correctness: applicable; auth variables, mode scopes, error shape, and lazy server startup match code and tests.
Security/privacy: applicable; examples contain placeholders only, no credential values or target IDs, and authn versus GA4/GTM authz is explicit.
Architecture/contracts: applicable; ADC-only precedence, optional GOOGLE_APPLICATION_CREDENTIALS, migration, and no-project runtime boundary match implementation.
Accessibility: not applicable; no UI or media changed.
```

### Task 6: Update Durable Repository Instructions

**Files:**
- Modify: `AGENTS.md`
- Test: instruction consistency search

- [ ] **Step 1: Replace obsolete authentication project context**

Update the relevant command, layout, and constraint lines to say:

```markdown
- Authorize local ADC: `npm run login` (delegates to gcloud application-default login with the complete runtime scope set and no quota project).
- Runtime authentication uses standard Google Application Default Credentials through `google.auth.GoogleAuth`; the ADC identity must already have the intended GA4/GTM product permissions.
- No Google Cloud project ID, Desktop OAuth client JSON, or repository-specific token path is required by the runtime.
- `GOOGLE_APPLICATION_CREDENTIALS` is optional and must be an absolute path when used; otherwise standard ADC discovery applies.
```

Update the source-layout description so `src/auth/` names scope tiers and the ADC auth factory, and remove `src/cli/` if it becomes empty.

- [ ] **Step 2: Consolidate project learnings around the new source of truth**

Replace Desktop-client-specific learnings with:

```markdown
- Use ADC as the only GA4/GTM runtime authentication path; never restore repository-managed Desktop-client or refresh-token fallbacks.
- `npm run login` provisions standard gcloud ADC with the complete runtime scope union and no quota project; keep the process active while the operator completes browser OAuth.
- Do not require a runtime Google Cloud project ID for GA4/GTM client calls; ADC supplies credentials, OAuth scopes authorize capabilities, and GA4/GTM product roles authorize resources.
- Use absolute placeholder paths for optional `GOOGLE_APPLICATION_CREDENTIALS`, the Node executable, and the server entrypoint in every MCP configuration example.
- Describe `INCLUDE_PUBLISH_SCOPE` only as the publish-mode operation gate; it does not alter scope acquisition or bypass publish guards.
```

Preserve the existing rule prohibiting real identifiers, tokens, emails, and machine paths in public documentation.

- [ ] **Step 3: Verify current instructions no longer mandate the removed flow**

Run:

```bash
rg -n "Desktop client|GOOGLE_OAUTH_CLIENT_SECRETS|GOOGLE_OAUTH_TOKEN_PATH|local Google user refresh token" AGENTS.md
```

Expected: no matches.

### Task 7: Full Verification and Read-Only ADC Smoke Test

**Files:**
- Modify after verification: `docs/agents/features/PLANNED-2026-09-01-adc-only-auth-design.md`
- Modify after verification: `docs/agents/features/PLANNED-2026-09-01-adc-only-auth-implementation.md`
- Rename after verification: both artifacts from `PLANNED-*` to `EXECUTED-*`

- [ ] **Step 1: Run all automated verification**

Run separately and read complete failures:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 2: Verify ADC token acquisition through the built runtime boundary**

Run this read-only smoke test without logging the returned token:

```bash
node --input-type=module -e 'import { buildAuth } from "./dist/auth/googleAuth.js"; await buildAuth({ mode: "read" }); process.stderr.write("ADC token acquisition succeeded\n");'
```

Expected: `ADC token acquisition succeeded` on stderr. If sandboxed network access blocks the request, rerun only after obtaining the required execution approval. If ADC itself fails, run `npm run login` interactively and keep it active until the operator finishes authorization.

- [ ] **Step 3: Run read-only GA4 and GTM visibility checks with session-provided targets**

Use the target resource names supplied by the operator in the active session without writing them into repository files or command examples. Call only list/get methods through the existing wrappers or MCP read tools.

Expected: either both resources are readable, or Google returns a product-role/visibility error. A `403` or target `404` is not an ADC project-ID failure; report it as missing GA4/GTM authorization or an incorrect target. Do not proceed to writes during this authentication task.

- [ ] **Step 4: Inspect the complete diff for scope and secrets**

Run:

```bash
git status --short
git diff --stat
git diff -- . ':(exclude)package-lock.json'
rg -n "refresh_token|client_secret|private_key|properties/[0-9]+|accounts/[0-9]+|GTM-[A-Z0-9]+|G-[A-Z0-9]+" README.md .env.example docs AGENTS.md src tests
```

Expected: changes trace only to ADC migration; no real credential values or production target identifiers appear. Historical artifacts may contain placeholder field names, but no raw values.

- [ ] **Step 5: Finalize artifact status and documentation review outcome**

After every required verification passes, rename both ADC artifacts to `EXECUTED-2026-09-01-...` and set `Status: executed`. Add these sections to the implementation artifact:

```markdown
## Outcome

Implemented as planned. The implementation is now the source of truth.

## Current Accuracy

Accurate as of execution. UI/UX wording and flow, backend/API correctness, security/privacy, and architecture/contracts were reviewed with no deferred findings. Accessibility was not applicable because no UI or media changed.
```

If implementation diverges, use `Implemented with changes` and name every material difference rather than copying the text above.

- [ ] **Step 6: Report results without committing**

Report the exact commands and outcomes, the ADC smoke-test result, any GA4/GTM product-access blocker, files removed, and the final artifact links. Leave all changes uncommitted unless the user separately authorizes a commit.
