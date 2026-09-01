# ADC-Only Authentication Design

Status: planned
Type: feature
Author: Juce

## Goal

Replace the repository-managed Google OAuth Desktop-client flow with Application Default Credentials (ADC) as the only authentication contract for GA4 and GTM operations. Runtime authentication must not require a Google Cloud project ID, OAuth client JSON path, or repository-specific refresh-token path.

## Current State

The server currently reads `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH`, validates a repository-specific token record, creates an OAuth2 client, and refreshes it before every operation. `npm run login` builds and runs a custom loopback OAuth implementation that creates that token record.

This duplicates credential acquisition already provided by Google Auth Library ADC and prevents the server from directly using authorized-user, service-account impersonation, workload identity, or other standard ADC sources.

## Chosen Approach

Use `google.auth.GoogleAuth` with the scope set required by the requested operation mode. Keep `npm run login` as an operator convenience command, but make it invoke `gcloud auth application-default login` rather than maintain a second credential format.

The alternatives were rejected for these reasons:

- Supporting both ADC and the Desktop-client token format would create competing credential precedence and recovery paths.
- Removing `npm run login` would make the runtime smaller but would discard the requested operator workflow.
- Parsing ADC files inside this repository would duplicate Google Auth Library behavior and exclude valid ADC credential types.

## Runtime Architecture

`buildAuth({ mode })` remains the single authentication boundary used by GA4 and GTM clients.

1. It rejects `publish` mode unless `INCLUDE_PUBLISH_SCOPE=1` before attempting credential discovery.
2. It selects the existing scope set for `read`, `write`, `version`, or `publish` mode.
3. It creates `google.auth.GoogleAuth({ scopes })` and resolves the client through `getClient()`.
4. It calls `getAccessToken()` once before returning so missing, expired, revoked, or otherwise unusable ADC fails at the authentication boundary rather than during a later product API call.
5. It returns the resolved Google auth client to the existing GA4 and GTM wrappers.

No runtime code reads or requires a Google Cloud project ID. `GoogleAuth` may internally discover project or quota context for a credential type, but this server does not use a project as a GA4/GTM target or configuration input.

Standard ADC precedence and credential types are delegated to Google Auth Library. Supported sources therefore include the local well-known ADC file, `GOOGLE_APPLICATION_CREDENTIALS`, service-account impersonation, and workload identity when Google Auth Library supports the source.

## Login Command

`npm run login` invokes `gcloud auth application-default login` with:

- `--disable-quota-project`, so login does not require or write a quota project;
- the existing GA4/GTM read, write, version, and publish scopes;
- `https://www.googleapis.com/auth/cloud-platform`, because gcloud requires that scope when a custom scope list is supplied.

The command owns no refresh token and writes no repository-specific credential file. It stays attached to the console while the operator completes browser authorization, and gcloud writes the resulting ADC to its normal local location.

The documentation must state that Google currently warns its built-in gcloud OAuth client may stop accepting custom Analytics scopes. This is an acquisition limitation, not a runtime project-ID requirement. Service-account impersonation or another externally provisioned ADC source remains compatible with the server if the built-in client becomes unsuitable.

## Errors and Security

Credential-discovery and token-refresh failures become `MCPError` values with code `PERMISSION_DENIED`, a stable ADC-specific message, and a secret-safe reason such as `adc_unavailable`. Raw provider errors, credential paths, token values, client identifiers, and response payloads must not be serialized.

The server does not inspect or persist ADC contents. Existing user-created Desktop-client JSON and token files become unused, but the migration does not delete them.

OAuth scopes authorize API capabilities; they do not grant GA4 property or GTM account/container access. The ADC identity must independently hold the required GA4 and GTM product roles. Existing workspace, approval-token, version, and publish safety gates remain unchanged.

## Code and Test Changes

Allowed implementation scope:

- Modify `src/auth/googleAuth.ts` to resolve and validate ADC.
- Delete `src/auth/userOAuth.ts` and `src/cli/login.ts` after their replacements are tested.
- Modify `package.json` so `npm run login` delegates to gcloud ADC login.
- Rewrite `tests/auth.test.ts` around an injected or mocked `GoogleAuth` boundary.
- Delete `tests/auth.userOAuth.test.ts` and `tests/cli.login.test.ts` after equivalent ADC/login contract coverage exists.
- Update `tests/server.boot.test.ts` to remove obsolete Desktop-client environment setup.
- Update `.env.example`, `README.md`, `docs/setup/README.md`, `docs/setup/google-cloud-credentials.md`, `docs/setup/user-oauth-login.md`, `docs/setup/mcp-client-configuration.md`, and `docs/setup/application-project-integration.md` to describe only ADC.
- Update root `AGENTS.md` project context and learnings so future agents do not restore the removed Desktop-client contract.

The existing setup filenames remain stable to avoid breaking links; their titles and contents may change to describe ADC. Historical executed or obsolete agent artifacts remain historical and are not rewritten as current documentation.

## Forbidden Regressions

- Do not add a runtime Google Cloud project ID requirement.
- Do not accept `GOOGLE_OAUTH_CLIENT_SECRETS` or `GOOGLE_OAUTH_TOKEN_PATH` as fallback authentication.
- Do not store, log, or return ADC contents or raw Google authentication errors.
- Do not broaden the scope selected for an operation mode.
- Do not weaken `INCLUDE_PUBLISH_SCOPE`, approval-token, non-live-workspace, version, preview, or publish guards.
- Do not change GA4/GTM desired-state behavior or execution-spec validation as part of this authentication migration.

## Acceptance Criteria

- `buildAuth` obtains an ADC client with exactly the scopes for the requested mode and validates it with one access-token request.
- Publish mode fails before ADC discovery when `INCLUDE_PUBLISH_SCOPE` is not `1`.
- ADC discovery and refresh failures return stable, redacted `PERMISSION_DENIED` responses.
- `npm run login` starts gcloud application-default login with no quota-project requirement and the complete runtime scope union.
- The current documentation contains no active instruction to create a Desktop OAuth client, set repository-specific OAuth path variables, or supply a runtime Google Cloud project ID.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
- A read-only smoke test proves that the runtime resolves the operator's existing ADC. A GA4/GTM product-level `403` or target-level `404` is reported as an authorization/visibility issue rather than an ADC or project-ID failure.

## Migration

Operators acquire or refresh ADC, restart the MCP host, and remove `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH` from the host configuration. `GOOGLE_APPLICATION_CREDENTIALS` remains optional and is used only when the operator wants to select a non-default ADC file. `INCLUDE_PUBLISH_SCOPE` retains its current meaning as a publish-mode operation gate.
