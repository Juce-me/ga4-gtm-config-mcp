# ga4-gtm-config-mcp

A custom [Model Context Protocol](https://modelcontextprotocol.io) server for **safe** GA4 and Google Tag Manager configuration automation. It consumes an approved `*.mcp-execution.yaml` desired-state spec, reads current GA4/GTM state, produces a deterministic diff, applies approved changes into a **non-live** GTM workspace, and hard-blocks both container-version creation and publishing unless explicitly approved.

## 1. What this does / does not do

**It does:**

- Load and validate an `mcp-execution.yaml` spec (schema + semantic checks).
- Read current GA4 Admin and GTM container state (read-only).
- Produce a deterministic diff between the spec's desired state and current state.
- Upsert approved entities (GA4 custom dimensions/metrics/key events; GTM variables/triggers/tags) into a new, non-live workspace — defaulting to `dry_run`.
- Expose a read-only manual preview/validation checklist.
- Create a GTM container version and publish it **only** behind hard, multi-condition gates.

**It does not:**

- Invent analytics strategy, events, custom dimensions, key events, consent behavior, or GTM architecture. That is the planner's job (see §2).
- Read Markdown plan tables as a source of truth — only the `*.mcp-execution.yaml` spec is authoritative.
- Expose raw API mutation tools (no `run_google_api_method`, no `create_tag(raw_json)`).
- Modify the live/default GTM workspace.
- Publish, create container versions, modify consent, or perform destructive changes by default — each is hard-gated.
- Store, log, echo, or write secret values (OAuth tokens, refresh tokens, Measurement Protocol secrets, client secrets) anywhere, including audit logs and tool output.

## 2. Relationship to `google-analytics-implementation-planner`

This server is the **execution layer**. The `google-analytics-implementation-planner` skill is the **planning layer**: it decides what events, dimensions, and tags should exist and emits the `*.mcp-execution.yaml` spec. A human reviews that spec, then this server executes it within strict safety rails. The split is deliberate — planning judgment never lives in the tool that holds write credentials.

See [`examples/mcp-execution.example.yaml`](examples/mcp-execution.example.yaml) for a complete, validator-passing spec with placeholder IDs.

## 3. Installation

Requires Node.js >= 20 LTS.

```bash
npm install      # installs pinned deps from the committed lockfile
npm run build    # compiles src/ -> dist/
npm test         # vitest run
npm run typecheck
```

## 4. Auth setup

### Runtime identity

The MCP runtime uses `google.auth.GoogleAuth` with **Application Default Credentials**, but it only accepts workload credentials:

- service-account JSON via `GOOGLE_APPLICATION_CREDENTIALS`
- external-account / Workload Identity Federation JSON via `GOOGLE_APPLICATION_CREDENTIALS`
- metadata-server credentials only when `ALLOW_GOOGLE_METADATA_AUTH=1`

It intentionally rejects `authorized_user` ADC files. A human user's OAuth refresh token must not be the MCP server's operating credential.

Copy [`.env.example`](.env.example) to `.env` and fill it in. Never commit real values.

### Authorization workflow

Use two separate authorization moments:

1. **One-time bootstrap authorization:** a human GA4/GTM admin gets a short-lived OAuth access token with only `analytics.manage.users` and `tagmanager.manage.users`.
2. **Programmatic access grant:** `npm run bootstrap:access` uses that token from stdin to create or update GA4 access bindings and GTM user permissions for the service-account email.
3. **Token disposal:** the bootstrap token is discarded after the command exits. It is not stored in `.env`, MCP client config, logs, or the audit log.
4. **Runtime authorization:** the MCP server runs only with service-account, Workload Identity Federation, or explicit metadata-server credentials. It rejects local `authorized_user` ADC files.
5. **Operational API access:** GA4/GTM authorize the service account directly because the bootstrap step granted product-level access to that identity. The MCP server never needs ongoing access to a human user account.

### One-time access bootstrap

Google's GA4/GTM UI user-management flows are not a reliable way to grant access to `*.iam.gserviceaccount.com` identities. Bootstrap product access through the official user-management APIs instead:

1. Create the service account or external-account/WIF credential.
2. Get a short-lived admin OAuth access token with `analytics.manage.users` and `tagmanager.manage.users`. OAuth Playground is acceptable for this one-time token. Do not create or store a refresh token for the MCP server.
3. Run the bootstrap CLI in dry-run mode first:

```bash
npm run bootstrap:access -- \
  --service-account-email svc@example.iam.gserviceaccount.com \
  --ga4-property properties/123456789 \
  --gtm-account 123456 \
  --gtm-container 987654
```

4. Re-run with `--apply` only after reviewing the planned operations:

```bash
npm run bootstrap:access -- \
  --service-account-email svc@example.iam.gserviceaccount.com \
  --ga4-property properties/123456789 \
  --gtm-account 123456 \
  --gtm-container 987654 \
  --apply
```

The CLI asks for the access token on stdin, uses it in memory, and prints only redacted summaries. It is not exposed as an MCP tool.

Verify afterward that the service account appears in GA4 access management and GTM user permissions, then configure the MCP runtime with the service-account/external-account credential only.

Domain-wide delegation can impersonate a Workspace user when direct service-account access cannot be made to work, but it requires Workspace super-admin setup and narrow OAuth scopes. Treat it as a fallback, not the default.

#### P1. Create the runtime credential

Use a service-account JSON key unless you already have Workload Identity Federation infrastructure. Enable the required APIs first:

```bash
gcloud config set project PROJECT_ID

gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  analyticsadmin.googleapis.com \
  tagmanager.googleapis.com
```

Create the service account:

```bash
gcloud iam service-accounts create ga4-gtm-mcp \
  --display-name="GA4/GTM MCP runtime"

SA_EMAIL="ga4-gtm-mcp@PROJECT_ID.iam.gserviceaccount.com"
```

Create the runtime JSON key and point the MCP at it:

```bash
gcloud iam service-accounts keys create ./secrets/ga4-gtm-mcp.json \
  --iam-account="$SA_EMAIL"

export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/secrets/ga4-gtm-mcp.json
```

Official references:

- [Enable Google Cloud services](https://docs.cloud.google.com/service-usage/docs/enable-disable)
- [Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)
- [Create service account keys](https://docs.cloud.google.com/iam/docs/keys-create-delete)
- [GA Admin API quickstart: service account setup](https://developers.google.com/analytics/devguides/config/admin/v1/quickstart)
- [GTM API authorization: service accounts](https://developers.google.com/tag-platform/tag-manager/api/v2/authorization)

For keyless production auth, use an external-account credential file from Workload Identity Federation and point `GOOGLE_APPLICATION_CREDENTIALS` at that file instead:

- [Workload Identity Federation overview](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Configure Workload Identity Federation with other providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)

#### P2. Get the one-time admin OAuth token

This token is only for `npm run bootstrap:access`. It must not be placed in `.env`, MCP config, audit logs, or any persistent file.

Create a Web application OAuth client and add this authorized redirect URI:

```text
https://developers.google.com/oauthplayground
```

If the OAuth app is in Testing, add the admin Google account as a test user. Public apps using sensitive scopes can require Google verification.

Official references:

- [Manage OAuth clients](https://support.google.com/cloud/answer/15549257)
- [OAuth Playground setup with your own OAuth client](https://developers.google.com/search-ads/reporting/concepts/oauth-playground)
- [Manage app audience and test users](https://support.google.com/cloud/answer/15549945)
- [OAuth scopes and app verification](https://developers.google.com/identity/protocols/oauth2/scopes)

In [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):

1. Open settings and enable `Use your own OAuth credentials`.
2. Enter the OAuth client ID and client secret.
3. Authorize these exact scopes:

```text
https://www.googleapis.com/auth/analytics.manage.users
https://www.googleapis.com/auth/tagmanager.manage.users
```

4. Sign in as the human admin who already has GA4/GTM user-management rights.
5. Exchange the authorization code for tokens.
6. Copy only the access token into the `bootstrap:access` prompt. Do not store the refresh token.

Scope and API proof:

- [GA4 `properties.accessBindings.create` requires `analytics.manage.users`](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings/create)
- [GA4 `AccessBinding` roles and user field](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/accounts.accessBindings)
- [GTM `accounts.user_permissions.create` requires `tagmanager.manage.users`](https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.user_permissions/create)
- [GTM `UserPermission` email, accountAccess, and containerAccess fields](https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.user_permissions)
- [OAuth access tokens are scoped to requested operations](https://developers.google.com/identity/protocols/oauth2)
- [OAuth web-server flow: online access tokens vs offline refresh tokens](https://developers.google.com/identity/protocols/oauth2/web-server)

UI limitation proof:

- [GA4 UI add-users flow expects a Google Account or Google Workspace Account](https://support.google.com/analytics/answer/9305788)
- [GTM UI user-management flow delegates access to Google accounts and sends invitations](https://support.google.com/tagmanager/answer/6107011)

### Required scopes per mode

Scopes are requested least-privilege per operation (`src/auth/scopes.ts`):

| Mode | Scopes |
|------|--------|
| `read` | `tagmanager.readonly`, `analytics.readonly` |
| `write` | read scopes + `tagmanager.edit.containers`, `analytics.edit` |
| `version` | read scopes + `tagmanager.edit.containerversions` |
| `publish` | write scopes + `tagmanager.publish` |

Bootstrap-only scopes are separate from runtime scopes:

| Purpose | Scopes |
|---------|--------|
| GA4 access bootstrap | `analytics.manage.users` |
| GTM access bootstrap | `tagmanager.manage.users` |

### `INCLUDE_PUBLISH_SCOPE` opt-in

The `publish` scope **cannot even be requested** unless `INCLUDE_PUBLISH_SCOPE=1` is set in the environment. This is enforced in two places (`buildAuth` at scope-construction time and `publishVersion` at call time) and is independent of the per-call `approval_token`. Leave it unset to make publishing impossible regardless of any other input.

## 5. Local run

```bash
npm run dev   # build + run
# or, against a prebuilt dist/:
npm run mcp   # node dist/server.js
```

The server speaks MCP over **stdio**. `stdout` is reserved for the transport; all logging goes to `stderr` as JSON lines. On boot it emits one `tool_registered` line per tool (12 total) on stderr and nothing on stdout.

## 6. MCP client configuration example

For Claude Desktop (`claude_desktop_config.json`) or Claude Code (`.mcp.json`):

```json
{
  "mcpServers": {
    "ga4-gtm-config": {
      "command": "node",
      "args": ["/absolute/path/to/ga4-gtm-config-mcp/dist/server.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account.json"
      }
    }
  }
}
```

Add `"INCLUDE_PUBLISH_SCOPE": "1"` to the `env` block only if and when you have explicitly decided to allow publishing.

## 6.1 ID formats

GTM tool arguments accept either bare IDs (`123`, `456`, `7`, `9`) or full resource names (`accounts/123`, `accounts/123/containers/456`, `accounts/123/containers/456/workspaces/7`, `accounts/123/containers/456/versions/9`). The server normalizes these before calling the Google APIs so planner-generated specs can use resource names while operators can still pass bare IDs.

GA4 property IDs accept either bare IDs or `properties/<property-id>`. `web_stream_id` accepts either a bare stream ID or `properties/<property-id>/dataStreams/<stream-id>` when listing Measurement Protocol secret metadata.

## 7. Tools

Every tool description begins with an explicit safety label. Only the two `_gated` tools take an `approval_token`.

| Tool | Label | Summary |
|------|-------|---------|
| `read_mcp_execution_spec` | `[read-only]` | Loads and returns the parsed `mcp-execution.yaml`. No Google API call. |
| `validate_mcp_execution_spec` | `[read-only]` | Runs schema + semantic validation; returns `ok`/`warnings`/`errors`. No Google API call. |
| `summarize_mcp_execution_spec` | `[read-only]` | Human-readable summary including all four gate booleans. |
| `read_ga4_state` | `[read-only]` | Normalized GA4 property/streams/dimensions/metrics/key events + MP secret **metadata only** (never values). |
| `read_gtm_state` | `[read-only]` | Normalized GTM container state including workspace capacity. |
| `diff_ga4_gtm_state` | `[read-only]` | Reads current state, normalizes the spec, returns a deterministic diff. No writes. |
| `create_gtm_workspace` | `[write — non-live workspace only]` | Creates a new GTM workspace. Blocks at capacity or against the live/default workspace. |
| `apply_gtm_workspace_changes` | `[dry-run-capable write]` | Upserts approved variables/triggers/tags into a non-live workspace. Defaults to `dry_run: true`. Never deletes; never modifies consent unless approved. |
| `apply_ga4_admin_changes` | `[dry-run-capable write]` | Upserts approved GA4 dimensions/metrics/key events. Defaults to `dry_run: true`. Never archives; never stores MP secret values. |
| `get_gtm_preview_info` | `[read-only]` | Workspace metadata + a fixed manual Tag Assistant / DebugView checklist. Does not create a version. |
| `create_gtm_container_version_gated` | `[gated dangerous]` | Creates a container version (this removes the workspace). Requires `create_container_version_allowed: true` **and** an `approval_token`. |
| `publish_gtm_version_gated` | `[gated dangerous]` | Publishes a container version. Refuses by default. Requires every publish-guard condition **and** an `approval_token`. |

### Workflows

**7.1 Dry-run validation + diff** — `validate_mcp_execution_spec` → `summarize_mcp_execution_spec` → `read_ga4_state` / `read_gtm_state` → `diff_ga4_gtm_state`. Entirely read-only; produces the change set a human reviews.

**7.2 Workspace apply** — `create_gtm_workspace` (new, non-live) → `apply_gtm_workspace_changes` / `apply_ga4_admin_changes` with `dry_run: true` (zero writes, confirm the plan) → re-run with `dry_run: false` to write into the workspace.

**7.3 Manual preview / DebugView validation** — `get_gtm_preview_info` returns the workspace metadata plus a manual checklist. Validation in Tag Assistant / GA4 DebugView is a human step; the server never claims it validated for you.

**7.4 Container version creation (gated)** — `create_gtm_container_version_gated` requires `spec_path`, `account_id`, `container_id`, `workspace_id`, `approval_token`, `diff_report_path`, and `version_name`. The gate returns **all** failing reasons. Note: creating a version removes the workspace, and publishing remains separately blocked.

**7.5 Publish (gated)** — `publish_gtm_version_gated` requires all of the above plus `validation_report_path`, `environment`, `operator_requested_publish`, **and** `INCLUDE_PUBLISH_SCOPE=1` in the environment. Refuses unless every condition passes.

## 8. Safety rules

Each guard is a pure, unit-tested function; the apply/gated tools layer them defensively.

- **Tool metadata guard** — every registered tool's description must start with an approved label and contain no instructional/bypass language; `[gated*]` tools must require `approval_token`. Enforced at boot **and** in tests.
- **PII guard** — rejects forbidden parameter keys, full URLs with query strings, and high-cardinality custom dimensions (e.g. `user_id`).
- **Secret guard** — secret-shaped fields are rejected; the spec's `secret_value` is constrained to the literal `"NEVER_STORE_SECRET_IN_SPEC"`; the redactor strips secret-shaped keys (incl. `private_key`, `credentials`) from all audit output.
- **UA-field guard** — Universal Analytics params (`event_category`, `event_action`, …) are rejected with a semantic error.
- **Per-event-tag guard** — flags the "one GA4 tag per event" anti-pattern; requires the reusable `{{DLV - event_name}}` path.
- **Consent guard** — blocks any consent tag/initialization/settings change unless `validation.consent_change_guard.modify_consent_settings: true`. Re-checked at the apply boundary.
- **Workspace guard** — unconditionally rejects the live/default workspace (`workspaceId: "0"` or name `"Default Workspace"`); enforces the GTM 3-workspace-per-container cap; detects name collisions.
- **Destructive-change guard** — deletes are blocked unless `destructive_changes_allowed: true`; archives are `API_UNSUPPORTED` regardless.
- **Version guard / publish guard** — multi-condition, default-deny gates that surface **every** failing reason at once (spec flag, approval token, diff/validation report, environment match, publish-scope presence).
- **Write payload guardrails** — non-dry-run apply converts normalized desired state into GA Admin / GTM API request bodies at the write boundary, including GTM trigger-ID resolution for tags. Tags with unresolved trigger names are blocked before any tag write.
- **Dangerous-tool revalidation** — container-version creation and publish re-run semantic validation against the current spec before any Google API call.
- **Dry-run default** — every write tool defaults to `dry_run: true`, making zero API write calls until explicitly disabled.
- **Audit log** — one JSON line per safety event to `.audit/audit-YYYY-MM-DD.log` (gitignored), every payload passed through the redactor.

## 9. Known limitations

- **Runtime OAuth refresh-token auth is deliberately unsupported** — use the one-time bootstrap CLI to grant product access, then run the MCP as a service account or workload identity.
- **GA Admin archive operations are unsupported** — archiving custom dimensions/metrics/key events returns `API_UNSUPPORTED`; no `archive*` functions are exported. Upserts that would change immutable fields (`parameterName`, `scope`) also throw `API_UNSUPPORTED` rather than failing mid-call.
- **Measurement Protocol secrets** — listing returns names/display names only; secret values are stripped at the wrapper boundary and never echoed.
- **GTM 3-workspace-per-container cap** — `create_gtm_workspace` blocks with `WORKSPACE_CAPACITY_BLOCKED` when full; an existing workspace must be merged or deleted first.
- **Diff over-reports `update` for GTM triggers and tags** — current state lacks resolved trigger event names and human-readable trigger names (GTM returns numeric `firingTriggerId`s). The `create`/`unchanged` paths and determinism are unaffected; ID→name resolution is a planned refinement.

## 10. Troubleshooting

- **`SPEC_INVALID` on a spec you believe is valid** — run `validate_mcp_execution_spec` and read the `errors` array; it names the exact path and reason (UA field, secret-shaped key, high-card dimension, per-event-tag explosion, consent change, or missing target ID outside dry-run).
- **`PERMISSION_DENIED` mentioning `INCLUDE_PUBLISH_SCOPE`** — you requested a publish-scoped operation without `INCLUDE_PUBLISH_SCOPE=1`. This is intentional; set it only if you mean to allow publishing.
- **`VERSION_CREATION_BLOCKED` / `PUBLISH_BLOCKED`** — the response lists every unmet condition. Resolve all of them (spec flag, approval token, report paths, environment) — there is no single override.
- **`WORKSPACE_UNSAFE`** — you targeted `workspaceId: "0"` or the default workspace. Create or target a dedicated non-live workspace.
- **`get_gtm_preview_info` returns only a checklist with a `note`** — the GTM API was unreachable (e.g. auth not configured). The manual checklist is still valid; configure credentials to get live workspace metadata.
- **No output on stdout when running the server** — expected. stdio is the MCP transport; logs are on stderr.
