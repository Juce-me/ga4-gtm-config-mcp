Status: obsolete
Type: bugfix
Author: a.feygin

# Service Account Bootstrap Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status note (2026-07-28):** Obsolete. The workload-credential and product-access bootstrap design was removed when runtime authentication moved to local user OAuth.

**Goal:** Keep service accounts as the MCP runtime identity while fixing the broken setup path where operators try to add a service account through GA4/GTM UI user management.

**Architecture:** Split authentication into two separate paths. Runtime MCP calls use only service-account or workload credentials and refuse accidental user ADC. A separate one-time bootstrap CLI, not an MCP tool, uses a short-lived admin user OAuth access token to call GA4/GTM user-management APIs and grant the service account product-level access.

**Tech Stack:** TypeScript 5.9, NodeNext ESM, Vitest, `googleapis` 172.0.0, Google Analytics Admin v1alpha accessBindings, Google Tag Manager v2 user_permissions.

---

## Verified Findings

1. The current README is wrong by omission: it says the service-account identity must already have GA4/GTM access, but gives a UI-based setup path that is now unreliable for service-account emails.
2. Google still documents service-account auth as valid. Google Cloud says service accounts authenticate as workload identities, GA Admin quickstart supports service-account auth, and GTM API auth lists service accounts as useful for automated access.
3. GA4 UI access management says users must be registered Google accounts, while GA Admin API v1alpha exposes `properties.accessBindings.create` / `accounts.accessBindings.create` with `analytics.manage.users`.
4. GTM UI says access is delegated to Google accounts and invitations must be accepted, which explains service-account invitation failures. GTM API v2 exposes `accounts.user_permissions.create` with `tagmanager.manage.users`.
5. Local package validation: `googleapis` 172.0.0 exposes `analyticsadmin('v1alpha').properties.accessBindings.create`, `analyticsadmin('v1alpha').accounts.accessBindings.create`, and `tagmanager('v2').accounts.user_permissions.create`.

Primary sources:

- Google Cloud service accounts: https://docs.cloud.google.com/iam/docs/service-account-overview
- GA Admin quickstart service-account setup: https://developers.google.com/analytics/devguides/config/admin/v1/quickstart
- GA Admin accessBindings resource: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings
- GA Admin accessBindings create: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings/create
- GA Help UI user requirements: https://support.google.com/analytics/answer/9305788
- GTM API auth and service accounts: https://developers.google.com/tag-platform/tag-manager/api/v2/authorization
- GTM user_permissions resource: https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.user_permissions
- GTM user_permissions create: https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.user_permissions/create
- GTM Help UI invitation model: https://support.google.com/tagmanager/answer/6107011

Public implementation evidence:

- GA4 UI failure plus API workaround report: https://www.ga4.guide/gamcp/
- GA4 UI failure plus API workaround report: https://www.okamomedia.tokyo/articles/ga4-service-account-add-error-bug
- GTM service-account invite acceptance issue: https://stackoverflow.com/questions/32431116/error-accessing-google-tagmanager-account-404-not-found-or-permission-denied

## Success Criteria

- MCP runtime cannot silently run as a human `authorized_user` ADC credential.
- Service-account runtime still works with `GOOGLE_APPLICATION_CREDENTIALS` JSON and can later support external-account/WIF JSON.
- One-time bootstrap can grant a service account GA4 and GTM access through official APIs using an admin user's short-lived OAuth access token.
- Bootstrap is dry-run by default, redacts all token-like values, and is not exposed as an MCP tool.
- README and `.env.example` describe the verified path and stop telling operators to use UI-only service-account sharing.

## Forbidden Regressions

- Do not add human refresh-token auth to the MCP runtime.
- Do not add `analytics.manage.users` or `tagmanager.manage.users` to normal read/write/version/publish runtime scopes.
- Do not store, log, or echo access tokens, refresh tokens, private keys, or client secrets.
- Do not add a raw Google API method tool.
- Do not weaken the existing publish-scope opt-in or gated dangerous tool checks.

## Files

- Create: `src/auth/credentialSource.ts`
- Create: `src/bootstrap/accessBootstrap.ts`
- Create: `src/cli/bootstrapAccess.ts`
- Create: `tests/auth.credentialSource.test.ts`
- Create: `tests/bootstrap.ga4Access.test.ts`
- Create: `tests/bootstrap.gtmAccess.test.ts`
- Modify: `src/auth/googleAuth.ts`
- Modify: `src/auth/scopes.ts`
- Modify: `tests/auth.test.ts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`

## Task 1: Refuse User ADC At Runtime

**Files:**
- Create: `src/auth/credentialSource.ts`
- Modify: `src/auth/googleAuth.ts`
- Create: `tests/auth.credentialSource.test.ts`
- Modify: `tests/auth.test.ts`

- [ ] **Step 1: Add tests for credential-source detection**

Create temp JSON files for:

```json
{"type":"service_account","client_email":"svc@example.iam.gserviceaccount.com","private_key":"fake"}
```

```json
{"type":"external_account","audience":"//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/p"}
```

```json
{"type":"authorized_user","client_id":"fake","client_secret":"fake","refresh_token":"fake"}
```

Expected:

- `service_account` and `external_account` are allowed.
- `authorized_user` throws `MCPError("PERMISSION_DENIED")`.
- Missing `GOOGLE_APPLICATION_CREDENTIALS` throws unless `ALLOW_GOOGLE_METADATA_AUTH=1`.

- [ ] **Step 2: Implement `assertRuntimeCredentialSource()`**

Add a small parser that reads only the `type` field from the JSON file. Do not return or log the file contents.

```ts
export type RuntimeCredentialSource = "service_account" | "external_account" | "metadata";
```

- [ ] **Step 3: Call the assertion from `buildAuth()` before constructing `GoogleAuth`**

Keep the existing publish opt-in exactly as-is.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/auth.test.ts tests/auth.credentialSource.test.ts
```

Expected: all tests pass.

## Task 2: Add Bootstrap-Only Scopes

**Files:**
- Modify: `src/auth/scopes.ts`
- Modify: `tests/auth.test.ts`

- [ ] **Step 1: Add user-management scope constants**

```ts
export const GA4_ACCESS_BOOTSTRAP_SCOPES = [
  "https://www.googleapis.com/auth/analytics.manage.users",
] as const;

export const GTM_ACCESS_BOOTSTRAP_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.manage.users",
] as const;
```

- [ ] **Step 2: Assert normal runtime scopes do not include them**

Add tests that `READ_SCOPES`, `WRITE_WORKSPACE_SCOPES`, `VERSION_SCOPES`, and `PUBLISH_SCOPES` do not contain either bootstrap scope.

- [ ] **Step 3: Run auth tests**

Run:

```bash
npm test -- tests/auth.test.ts
```

Expected: all tests pass.

## Task 3: Implement GA4 Access Bootstrap Helpers

**Files:**
- Create: `src/bootstrap/accessBootstrap.ts`
- Create: `tests/bootstrap.ga4Access.test.ts`

- [ ] **Step 1: Test idempotent GA4 behavior with fake clients**

Cases:

- Existing binding with all requested roles: no write.
- Missing binding: call `properties.accessBindings.create`.
- Existing binding missing a role: call `properties.accessBindings.patch`.
- `dryRun: true`: return planned operation without create/patch.

- [ ] **Step 2: Implement `ensureGa4AccessBinding()`**

Use Analytics Admin v1alpha shapes:

```ts
{
  user: serviceAccountEmail,
  roles: ["predefinedRoles/editor"]
}
```

Normalize `propertyId` to `properties/<id>`. Do not support delete.

- [ ] **Step 3: Run GA4 bootstrap tests**

Run:

```bash
npm test -- tests/bootstrap.ga4Access.test.ts
```

Expected: all tests pass.

## Task 4: Implement GTM Access Bootstrap Helpers

**Files:**
- Modify: `src/bootstrap/accessBootstrap.ts`
- Create: `tests/bootstrap.gtmAccess.test.ts`

- [ ] **Step 1: Test idempotent GTM behavior with fake clients**

Cases:

- Existing `emailAddress` has requested account/container access: no write.
- Missing user permission: call `accounts.user_permissions.create`.
- Existing user permission needs stronger container permission: call `accounts.user_permissions.update`.
- `dryRun: true`: return planned operation without create/update.

- [ ] **Step 2: Implement `ensureGtmUserPermission()`**

Use Tag Manager v2 shapes:

```ts
{
  emailAddress: serviceAccountEmail,
  accountAccess: { permission: "user" },
  containerAccess: [{ containerId, permission: "edit" }]
}
```

Support only `read`, `edit`, `approve`, and `publish` container permissions. Default to `edit`; publishing still remains gated by the existing MCP runtime.

- [ ] **Step 3: Run GTM bootstrap tests**

Run:

```bash
npm test -- tests/bootstrap.gtmAccess.test.ts
```

Expected: all tests pass.

## Task 5: Add One-Time Bootstrap CLI

**Files:**
- Create: `src/cli/bootstrapAccess.ts`
- Modify: `package.json`

- [ ] **Step 1: Add CLI argument tests by calling exported parser functions**

Required args:

- `--service-account-email`
- `--ga4-property` or `--skip-ga4`
- `--gtm-account` and `--gtm-container`, or `--skip-gtm`
- `--dry-run` defaults to true; `--apply` is required for writes

- [ ] **Step 2: Implement CLI**

The CLI should:

1. Prompt for a short-lived admin OAuth access token from stdin.
2. Build `google.auth.OAuth2`, set only `{ access_token }`, and never request or persist refresh tokens.
3. Build `google.analyticsadmin({ version: "v1alpha", auth })` for bootstrap access bindings.
4. Build `google.tagmanager({ version: "v2", auth })` for GTM user permissions.
5. Print only redacted summaries.

- [ ] **Step 3: Add npm script**

```json
"bootstrap:access": "npm run build && node dist/cli/bootstrapAccess.js"
```

- [ ] **Step 4: Run CLI dry-run parser tests and typecheck**

Run:

```bash
npm test -- tests/bootstrap.ga4Access.test.ts tests/bootstrap.gtmAccess.test.ts
npm run typecheck
```

Expected: all tests and typecheck pass.

## Task 6: Update Setup Documentation

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Replace UI-only service-account setup**

Document the verified setup:

1. Create service account or external-account/WIF credentials.
2. Run the one-time bootstrap CLI with an admin user's short-lived OAuth token.
3. Verify the service account appears in GA4 access management and GTM user permissions.
4. Configure MCP runtime with service-account credentials only.

- [ ] **Step 2: Document how to get a one-time token**

Provide two paths:

- OAuth Playground with `analytics.manage.users` and `tagmanager.manage.users`.
- A local OAuth client/manual access token path, if implemented later.

State explicitly: do not put the admin user's refresh token in `.env` or MCP config.

- [ ] **Step 3: Document fallback options**

Fallbacks:

- Workspace domain-wide delegation can impersonate a Workspace user, but only with super-admin setup and narrow scopes; use it only when direct service-account access cannot be made to work.
- OAuth refresh-token runtime is deliberately not supported.

- [ ] **Step 4: Run docs grep**

Run:

```bash
rg -n "refresh-token flow|Use the service-account path until|must have GA4 Admin.*GTM.*access" README.md .env.example src
```

Expected: no stale claims remain.

## Task 7: Full Verification

**Files:**
- All touched files

- [ ] **Step 1: Run the focused suite**

```bash
npm test -- tests/auth.test.ts tests/auth.credentialSource.test.ts tests/bootstrap.ga4Access.test.ts tests/bootstrap.gtmAccess.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run full checks**

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Optional live validation on disposable GA4/GTM resources**

Only run with explicit operator approval and disposable resources:

1. Create a disposable service account.
2. Use the bootstrap CLI with `--apply` to grant GA4 Editor and GTM Edit access.
3. Start the MCP with the service-account credentials.
4. Call read-only `read_ga4_state` and `read_gtm_state`.
5. Remove the service account from GA4/GTM access after the test.

Expected: read-only tools succeed as the service account; no user OAuth refresh token is present in MCP config.

## Current Risk Assessment

- GA4 path confidence: high. Official API docs plus current public workaround reports support `accessBindings.create`.
- GTM path confidence: medium-high. Official API docs support service accounts and user_permissions; public reports confirm UI invite friction. A live test should be done on a disposable GTM container before shipping docs as fully proven.
- Domain-wide delegation: supported by Google Workspace docs but intentionally fallback only because it gives broad impersonation authority and requires Workspace super-admin control.

## Outcome

Superseded by implementation. The service-account runtime, workload credential sources, user-management bootstrap scopes, and bootstrap CLI described here were implemented historically and later removed. Current runtime authentication uses a local Google user OAuth grant created by `npm run login`.

## Current Accuracy

Obsolete as current guidance. The problem investigation, original design, and verification record remain historical context only. The filenames, commands, environment variables, credential model, and setup flow in this artifact no longer match the repository; use `README.md` and `docs/setup/` as the current source of truth.
