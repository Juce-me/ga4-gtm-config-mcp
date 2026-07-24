# Replace workload-credential auth with user-OAuth

Status: planned
Review: required
Type: feature
Author: a.feygin

## Goal

Make the MCP server operate under the **human operator's own Google identity**, using
their existing GA4/GTM permissions. Remove all workload-credential (service-account
family) auth. A one-time browser consent stores a refresh token; runtime reuses it.

This reverses a previously load-bearing constraint (the runtime used to reject
`authorized_user` credentials so a human refresh token never operated the server).
That reversal is intentional and owner-approved for this solo/local deployment.

## Decisions (fixed — do not re-litigate during execution)

1. **Approach:** dedicated GCP **Desktop** OAuth 2.0 Client ID + a login CLI that runs a
   local loopback consent flow and stores a refresh token. No `gcloud` dependency.
2. **Coexistence:** **replace** — user-OAuth becomes the *only* auth source. Remove
   `service_account`, `external_account`, `impersonated_adc`, and `metadata` handling
   entirely, plus the `bootstrap:access` CLI.
3. **Scopes:** consent to the **full read + write + publish** scope set at login.
   `INCLUDE_PUBLISH_SCOPE=1` remains the runtime gate for publish mode.

## Accepted risk (record, do not "fix" in code)

- The stored refresh token is publish-capable; the only runtime barrier to a live
  publish is `INCLUDE_PUBLISH_SCOPE=1`. This is a deliberate reduction in
  defense-in-depth versus the service-account model.
- No non-human/CI auth path remains after this change. Reintroducing one is new work.

## What exactly changes

### New

- `src/auth/userOAuth.ts` — resolves OAuth client secrets (`GOOGLE_OAUTH_CLIENT_SECRETS`)
  and the stored token (`GOOGLE_OAUTH_TOKEN_PATH`, default `.secrets/user-oauth-token.json`);
  builds a configured `google.auth.OAuth2` client from `{ client_id, client_secret,
  refresh_token }`. Exposes the granted-scope set for validation.
- `src/cli/login.ts` — `npm run login`. Loopback installed-app flow:
  1. Load Desktop client secrets from `GOOGLE_OAUTH_CLIENT_SECRETS`.
  2. Start a `http://127.0.0.1:<ephemeral-port>` listener as the redirect URI.
  3. Print the consent URL to **stderr** (do not auto-open; no new dependency).
     Build it with `access_type=offline`, `prompt=consent`, `include_granted_scopes=false`,
     and the full scope set from `scopes.ts`.
  4. Capture the `code` on the loopback, exchange for tokens.
  5. Assert every requested scope is present in the granted scopes; fail loudly if not.
  6. Write `{ refresh_token, granted_scopes, client_id, obtained_at }` to the token path,
     `chmod 600`, creating `.secrets/` if absent. Route all logging through `utils/redact`.
     Never print token values.

### Rewritten

- `src/auth/credentialSource.ts` — delete every workload branch and all impersonated-ADC
  guards (`assertValidImpersonatedAdc`, universe-domain/URL checks). New behavior:
  return source `"user_oauth"` when a token file with a `refresh_token` exists and the
  client secrets resolve; otherwise throw `PERMISSION_DENIED` instructing the operator to
  run `npm run login`. `RuntimeCredentialSource` type becomes `"user_oauth"` only.
- `src/auth/googleAuth.ts` — `buildAuth({ mode })`:
  - Keep the existing guard: `mode === "publish"` requires `INCLUDE_PUBLISH_SCOPE=1`.
  - Build the OAuth2 client via `userOAuth.ts`. googleapis auto-refreshes access tokens.
  - Replace scope *construction* with scope *assertion*: verify the stored token's
    `granted_scopes` covers the scopes the mode needs (`READ`/`WRITE`/`VERSION`/`PUBLISH`
    from `scopes.ts`); if not, throw `PERMISSION_DENIED` telling the operator to re-run
    `npm run login`. Remove the `google.auth.Compute` (metadata) branch.
- `src/auth/scopes.ts` — keep `READ_SCOPES`, `WRITE_WORKSPACE_SCOPES`, `VERSION_SCOPES`,
  `PUBLISH_SCOPES`. Add one exported `ALL_LOGIN_SCOPES` (= `PUBLISH_SCOPES`, the superset)
  for the login CLI. Delete `GA4_ACCESS_BOOTSTRAP_SCOPES` and `GTM_ACCESS_BOOTSTRAP_SCOPES`.

### Deleted

- `src/cli/bootstrapAccess.ts`
- `src/bootstrap/accessBootstrap.ts` (and the now-empty `src/bootstrap/` dir)
- `package.json` script `bootstrap:access`
- Tests: `tests/bootstrap.cli.test.ts`, `tests/bootstrap.ga4Access.test.ts`,
  `tests/bootstrap.gtmAccess.test.ts`

### Config & docs

- `.env.example` / `.env`: remove `GOOGLE_APPLICATION_CREDENTIALS`,
  `ALLOW_GOOGLE_METADATA_AUTH`, `ALLOW_GOOGLE_IMPERSONATED_ADC`. Add
  `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH`. Keep `INCLUDE_PUBLISH_SCOPE`.
- `README.md` §4 (setup/auth), §6 (MCP client config example), §9 (known limitations:
  drop "runtime OAuth refresh-token auth is deliberately unsupported").
- `docs/setup/README.md`, `docs/setup/google-cloud-credentials.md`,
  `docs/setup/product-access-bootstrap.md` (retire the SA bootstrap; document the OAuth
  client creation + `npm run login`), `docs/setup/mcp-client-configuration.md` (new env block).
- Root `AGENTS.md` §11 Project Learnings: replace the SA/impersonated-ADC learnings with the
  user-OAuth model and the accepted-risk note above.
- Update the local Claude Code MCP registration (`claude mcp` user config) env block to the
  new variables — call out in Outcome; not a repo file.

## Forbidden regressions

- No change to any tool's behavior, description labels, or the `assertSafeToolMetadata` gate.
- No change to the safety guards (PII, secret, UA-field, per-event-tag, consent, workspace,
  destructive, version/publish). The publish gate must still fail closed without
  `INCLUDE_PUBLISH_SCOPE=1`.
- No secret/token value may be logged, written to `.audit/`, or committed. `.secrets/` stays
  gitignored (already is). Confirm `utils/redact` still redacts `refresh_token`/`oauth`/`token`
  (it does today — verify, do not weaken).
- No new runtime dependency. Use Node built-ins (`http`, `crypto`) + existing `googleapis`.
- Do not touch `src/tools/`, `src/ga4/`, `src/gtm/` logic except imports that break from the
  auth signature (none expected — `buildAuth({ mode })` keeps its signature).

## Files allowed to touch

```
src/auth/credentialSource.ts        (rewrite)
src/auth/googleAuth.ts              (rewrite)
src/auth/scopes.ts                  (edit)
src/auth/userOAuth.ts              (new)
src/cli/login.ts                    (new)
src/cli/bootstrapAccess.ts          (delete)
src/bootstrap/accessBootstrap.ts    (delete)
package.json                        (scripts: -bootstrap:access, +login)
.env.example                        (edit)
tests/auth.credentialSource.test.ts (rewrite)
tests/auth.test.ts                  (edit)
tests/auth.userOAuth.test.ts        (new)
tests/cli.login.test.ts             (new)
tests/bootstrap.*.test.ts           (delete x3)
README.md                           (edit §4,§6,§9)
docs/setup/*.md                     (edit)
AGENTS.md                           (edit §11)
```

## Expected behavior

- **Before login:** any tool needing Google access fails with a clear `PERMISSION_DENIED`
  naming `npm run login`. Read-only spec tools (`read/validate/summarize_mcp_execution_spec`)
  still work — they make no Google call.
- **`npm run login`:** prints a consent URL on stderr, catches the loopback redirect, stores
  the refresh token, prints a redacted success line. Re-runnable (overwrites the token).
- **After login:** tools operate under the operator's identity with their real GA4/GTM
  permissions. `publish_gtm_version_gated` still refuses unless `INCLUDE_PUBLISH_SCOPE=1`
  *and* all publish-guard conditions pass.

## Task breakdown (each ends with a verification)

1. `scopes.ts`: add `ALL_LOGIN_SCOPES`, remove bootstrap scope consts. — `npm run typecheck`.
2. `userOAuth.ts`: client-secrets + token resolution and OAuth2 client builder, with unit
   tests using a temp token file + fake client secrets. — `tests/auth.userOAuth.test.ts` green.
3. `credentialSource.ts` rewrite + `tests/auth.credentialSource.test.ts` rewrite (present →
   `user_oauth`; missing/malformed → throws). — new test file green.
4. `googleAuth.ts` rewrite (publish env gate kept, scope assertion added) + update
   `tests/auth.test.ts`. — `tests/auth.test.ts` green.
5. `login.ts` CLI + `tests/cli.login.test.ts` (inject fake OAuth2 client + fake code source,
   mirror `bootstrap.cli.test.ts`; assert token persisted, scopes validated, no value logged).
   — new test green.
6. Delete bootstrap CLI, bootstrap module, 3 bootstrap tests; drop `bootstrap:access`, add
   `login` in `package.json`. — `npm run build` + `npm test` green (full suite).
7. Docs/env: `.env.example`, `README.md` §4/§6/§9, `docs/setup/*`, `AGENTS.md` §11. — manual
   review against Doc Review Criteria; no stale `GOOGLE_APPLICATION_CREDENTIALS`/bootstrap refs
   (`grep -rn "GOOGLE_APPLICATION_CREDENTIALS\|bootstrap:access" README.md docs/ .env.example`
   returns nothing).
8. End-to-end (manual, real Google account): create Desktop OAuth client, `npm run login`,
   then read `properties/538964441` and resolve container `GTM-NZJW2CFN` — expect HTTP 200
   where the service account previously got `PERMISSION_DENIED`.

## Acceptance criteria

- [ ] `npm run build`, `npm run typecheck`, `npm test` all green.
- [ ] No `authorized_user`/service-account/impersonated/metadata handling remains in
      `src/auth/`; `credentialSource` returns only `"user_oauth"`.
- [ ] `npm run login` stores a refresh token under `.secrets/` (chmod 600) and validates
      granted scopes; nothing secret is logged or committed.
- [ ] Publish still fails closed without `INCLUDE_PUBLISH_SCOPE=1`; `assertSafeToolMetadata`
      and all safety-guard tests unchanged and green.
- [ ] Real read against property `538964441` and container `GTM-NZJW2CFN` succeeds under the
      operator's identity.
- [ ] `README.md`, `docs/setup/*`, `.env.example`, `AGENTS.md` §11 reflect the new model with
      no stale workload-credential references.

## Cross-references

- Auth code today: `src/auth/credentialSource.ts`, `src/auth/googleAuth.ts`, `src/auth/scopes.ts`.
- Injection pattern to mirror for the login test: `tests/bootstrap.cli.test.ts`.
- Redactor to preserve: `src/utils/redact.ts` (`SECRET_KEY_RE`).
