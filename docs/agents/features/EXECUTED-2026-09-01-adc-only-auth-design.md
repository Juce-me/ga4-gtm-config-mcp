# ADC-Only Authentication Design

Status: executed
Type: feature
Author: Juce-me

## Goal

Replace the repository-managed Google OAuth Desktop-client flow with Application Default Credentials (ADC) as the only authentication contract for GA4 and GTM operations. Runtime authentication must not require a Google Cloud project ID, OAuth client JSON path, or repository-specific refresh-token path.

## Current State

The server currently reads `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH`, validates a repository-specific token record, creates an OAuth2 client, and refreshes it before every operation. `npm run login` builds and runs a custom loopback OAuth implementation that creates that token record.

This duplicates credential acquisition already provided by Google Auth Library ADC and prevents the server from directly using authorized-user, service-account impersonation, workload identity, or other standard ADC sources.

## Chosen Approach

Use `google.auth.GoogleAuth` with the scope set required by the requested operation mode. Keep `npm run login` as an operator convenience command, but make it invoke `gcloud auth application-default login` rather than maintain a second credential format. The repository-owned command uses gcloud's built-in OAuth client as a best-effort default and accepts an acquisition-only `--client-id-file` argument for Google's supported custom-scope path.

The alternatives were rejected for these reasons:

- Supporting both ADC and the Desktop-client token format would create competing credential precedence and recovery paths.
- Removing `npm run login` would make the runtime smaller but would discard the requested operator workflow.
- Parsing ADC files inside this repository would duplicate Google Auth Library behavior and exclude valid ADC credential types.

## Runtime Architecture

`buildAuth({ mode })` remains the single authentication boundary used by GA4 and GTM clients.

1. It rejects `publish` mode unless `INCLUDE_PUBLISH_SCOPE=1` before attempting credential discovery.
2. It selects the existing scope set for `read`, `write`, `version`, or `publish` mode.
3. If `GOOGLE_APPLICATION_CREDENTIALS` is set, it requires a nonblank absolute path without reading or serializing the path value. Unset means standard ADC discovery.
4. It creates `google.auth.GoogleAuth({ scopes })` and resolves a client through `getClient()` only for eager validation.
5. It calls `getAccessToken()` once and requires a nonblank returned token so missing, expired, revoked, or otherwise unusable ADC fails at the authentication boundary rather than during a later product API call.
6. It returns the `GoogleAuth` provider, not the resolved `AnyAuthClient` union, to the existing GA4 and GTM wrappers. The generated API clients accept the provider type and perform their normal per-request credential handling.

No runtime code reads or requires a Google Cloud project ID. `GoogleAuth` may internally discover project or quota context for a credential type, but this server does not use a project as a GA4/GTM target or configuration input.

Standard ADC precedence and credential types are delegated to Google Auth Library. Supported sources therefore include the local well-known ADC file, `GOOGLE_APPLICATION_CREDENTIALS`, service-account impersonation, and workload identity when Google Auth Library supports the source.

## Login Command

`npm run login` invokes `gcloud auth application-default login` with:

- `--disable-quota-project`, so login does not require or write a quota project;
- the existing GA4/GTM read, write, version, and publish scopes;
- `https://www.googleapis.com/auth/cloud-platform`, because gcloud requires that scope when a custom scope list is supplied.

The command owns no refresh token and writes no repository-specific credential file. It stays attached to the console while the operator completes authorization, and gcloud writes the resulting ADC to its normal local location. Browser launching, printed authorization URLs, and `--no-launch-browser` or `--no-browser` behavior remain owned by gcloud; npm forwards those operator-supplied flags without implementing a second browser flow.

Google's current documentation directs non-Cloud custom scopes to a custom OAuth client or service-account impersonation. The repository command's built-in-client form is therefore best-effort only: gcloud currently warns that its built-in client may stop accepting custom Analytics scopes, and account or policy enforcement can reject it. The supported user-ADC path is `npm run login -- --client-id-file=/absolute/path/to/oauth-client.json`; that file is consumed by gcloud only during credential acquisition and is never a runtime server input. Service-account impersonation or another externally provisioned ADC source also remains compatible.

For authorized-user ADC, the credential retains the complete scope union granted during gcloud login. Passing a per-mode scope set to `GoogleAuth` expresses the requested runtime capabilities but does not narrow that acquisition-time grant. Existing publish and safety gates remain the enforcement boundary for dangerous operations.

Primary acquisition references are Google's [ADC credential setup guidance](https://docs.cloud.google.com/docs/authentication/application-default-credentials), [`gcloud auth application-default login` reference](https://docs.cloud.google.com/sdk/gcloud/reference/auth/application-default/login), and [ADC troubleshooting guidance](https://docs.cloud.google.com/docs/authentication/troubleshoot-adc). Product scope inventories remain authoritative in the [Google OAuth scope catalog](https://developers.google.com/identity/protocols/oauth2/scopes) and [GTM API authorization guide](https://developers.google.com/tag-platform/tag-manager/api/v2/authorization).

## Errors and Security

Credential-discovery, invalid credential-path configuration, empty-token, and token-refresh failures become `MCPError` values with code `PERMISSION_DENIED`, a stable ADC-specific message, and a secret-safe reason such as `adc_unavailable`. New or changed authentication code, tests, logs, fixtures, and documentation must not serialize raw provider errors, credential paths, token values, client identifiers, response payloads, or production resource identifiers. Existing repository-wide error and historical-artifact hygiene outside the authentication change is separate follow-up work and must not be silently claimed as fixed here.

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
- After ADC ships, rename `docs/agents/features/EXECUTED-user-oauth-auth.md` to `OBSOLETE-user-oauth-auth.md`, update its status and Current Accuracy, and link it to the executed ADC artifacts without rewriting its historical implementation record.

The existing setup filenames remain stable to avoid breaking links; their titles and contents may change to describe ADC. Historical artifacts retain their implementation history, but any artifact that still presents the replaced Desktop-client flow as current must receive the required obsolete status and supersession note after ADC ships.

## Forbidden Regressions

- Do not add a runtime Google Cloud project ID requirement.
- Do not accept `GOOGLE_OAUTH_CLIENT_SECRETS` or `GOOGLE_OAUTH_TOKEN_PATH` as fallback authentication.
- Do not introduce storage, logging, or serialization of ADC contents, credential paths, production identifiers, or raw Google authentication errors through the changed authentication boundary and documentation.
- Do not broaden the scope selected for an operation mode.
- Do not weaken `INCLUDE_PUBLISH_SCOPE`, approval-token, non-live-workspace, version, preview, or publish guards.
- Do not change GA4/GTM desired-state behavior or execution-spec validation as part of this authentication migration.

## Acceptance Criteria

- `buildAuth` passes exactly the requested mode's scopes to `GoogleAuth`, validates a resolved client with one nonblank access-token result, and returns the `GoogleAuth` provider accepted by both generated API clients.
- Publish mode fails before ADC discovery when `INCLUDE_PUBLISH_SCOPE` is not `1`.
- ADC discovery and refresh failures return stable, redacted `PERMISSION_DENIED` responses.
- `npm run login` starts gcloud application-default login with no quota-project requirement, the complete runtime scope union, and gcloud's required `cloud-platform` scope; documentation distinguishes the best-effort built-in-client path from the supported acquisition-only custom-client or impersonation paths.
- The current documentation contains no active instruction to configure a Desktop OAuth client as a runtime server input, set repository-specific OAuth path variables, or supply a runtime Google Cloud project ID. Any custom client file is documented only as an acquisition-time gcloud input.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
- A read-only smoke test proves that the runtime resolves the operator's existing ADC. A GA4/GTM `403` is classified without exposing the provider payload and may indicate a missing product role, insufficient OAuth scope, disabled API, consumer/quota policy, or organization policy; a target `404` may indicate an incorrect or invisible resource. Neither result by itself proves an ADC project-ID failure.

## Migration

Operators acquire or refresh ADC, restart the MCP host, and remove `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH` from the host configuration. Existing repository-specific Desktop client and token files become unused but are never deleted by the migration. `GOOGLE_APPLICATION_CREDENTIALS` remains optional and, when set, must be a nonblank absolute path selecting a non-default ADC file. `INCLUDE_PUBLISH_SCOPE` retains its current meaning as a publish-mode operation gate.

## Outcome

Implemented as planned. The implementation is now the source of truth. Automated tests,
typecheck, and build passed; the read-only built-runtime ADC smoke test was attempted and
returned the redacted `PERMISSION_DENIED` / `adc_unavailable` result.

## Current Accuracy

Accurate as of execution: the documented architecture and accepted risks match the
implementation. UI/UX wording and flow, backend/API correctness, security/privacy, and
architecture/contracts were reviewed. Accessibility was not applicable because no UI or
media changed. The pre-existing absence of a documented vulnerability/incident contact
remains deferred and was not changed by this authentication migration. Credentialed operator
acceptance remains pending because existing ADC was unavailable or invalid and no private
GA4/GTM target resources were supplied for read-only visibility checks.
