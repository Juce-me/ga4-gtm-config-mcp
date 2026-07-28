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
- Put secret values in specs, audit logs, or tool output. The local login necessarily stores one refresh token in the private file configured by `GOOGLE_OAUTH_TOKEN_PATH`.

## 2. Relationship to `google-analytics-implementation-planner`

This server is the **execution layer**. The `google-analytics-implementation-planner` skill is the **planning layer**: it decides what events, dimensions, and tags should exist and emits the `*.mcp-execution.yaml` spec. A human reviews that spec, then this server executes it within strict safety rails. The split is deliberate — planning judgment never lives in the tool that holds write credentials.

Typical local workflow:

1. In the application repo that needs GA4/GTM configuration, run the `google-analytics-skill` / `google-analytics-implementation-planner` setup and produce a reviewed `*.mcp-execution.yaml` spec.
2. In this `ga4-gtm-config-mcp` repo, build the MCP server and register its built `dist/server.js` with your local MCP host.
3. Run Codex or another MCP host inside the application repo, then call this server's tools with `spec_path` pointing at that app repo's reviewed `*.mcp-execution.yaml`.

See [`examples/mcp-execution.example.yaml`](examples/mcp-execution.example.yaml) for a complete, validator-passing spec with placeholder IDs.

## 3. Installation

Requires Node.js >= 20 LTS.

```bash
npm install      # installs pinned deps from the committed lockfile
npm run build    # compiles src/ -> dist/
npm test         # vitest run
npm run typecheck
```

## 4. Setup and authorization

Start with [Setup overview](docs/setup/README.md), then follow:

- [Google Cloud OAuth setup](docs/setup/google-cloud-credentials.md): enable the GA4/GTM APIs, choose the OAuth audience and publishing status, and create a Desktop client.
- [User OAuth login](docs/setup/user-oauth-login.md): configure absolute paths, run `npm run login`, understand token storage and all-scope consent, and recover from revocation or `invalid_grant`.
- [MCP client configuration](docs/setup/mcp-client-configuration.md): launch the stdio server with the same private absolute paths.
- [Application project integration](docs/setup/application-project-integration.md): keep credentials separate from application repos and hand off a reviewed spec.

The short version:

1. The operator's Google user must already have the intended permissions in each target GA4 property and GTM account/container. OAuth does not grant product access.
2. In a Google Cloud project, enable the Google Analytics Admin API and Tag Manager API, then create an OAuth client with application type **Desktop app**.
3. Set `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH` to private absolute paths.
4. Run `npm run login` and complete browser consent. The command requests the full read/write/version/publish scope set and stores a plaintext refresh token with file mode `0600`.
5. Configure the MCP client with the same two absolute paths. Do not rely on `.env` auto-loading, `~`, `$HOME`, or relative paths.
6. Leave `INCLUDE_PUBLISH_SCOPE` unset unless publishing is approved. It gates runtime publish mode; it does not change the scopes requested during login.

For a durable one-time local login, the OAuth app must be eligible for **Internal** use or an **External** app must be configured for **In production**. External apps in Testing require test users for these non-basic scopes, and their refresh tokens expire after seven days. Verification requirements, warning screens, and user caps depend on the audience and requested scopes; follow Google's current policy:

- [OAuth overview and refresh-token expiration](https://developers.google.com/identity/protocols/oauth2)
- [OAuth app audience and seven-day Testing behavior](https://support.google.com/cloud/answer/15549945)

## 5. Local run

```bash
npm run dev   # build + run
# or, against a prebuilt dist/:
npm run mcp   # node dist/server.js
```

The server speaks MCP over **stdio**. `stdout` is reserved for the transport; all logging goes to `stderr` as JSON lines. On boot it emits one `tool_registered` line per tool (12 total) on stderr and nothing on stdout.

## 6. MCP client configuration example

For a JSON-based MCP host:

```json
{
  "mcpServers": {
    "ga4-gtm-config": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/ga4-gtm-config-mcp/dist/server.js"],
      "env": {
        "GOOGLE_OAUTH_CLIENT_SECRETS": "/absolute/path/to/private/google-oauth-client.json",
        "GOOGLE_OAUTH_TOKEN_PATH": "/absolute/path/to/private/google-oauth-token.json"
      }
    }
  }
}
```

Add `"INCLUDE_PUBLISH_SCOPE": "1"` to the `env` block only after publishing is explicitly approved. Login already acquired the publish scope; this setting gates the operation and does not bypass the remaining publish guards.

For Codex local setup, add a private configuration after `npm run build`:

```toml
[mcp_servers.ga4-gtm-config]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/ga4-gtm-config-mcp/dist/server.js"]

[mcp_servers.ga4-gtm-config.env]
GOOGLE_OAUTH_CLIENT_SECRETS = "/absolute/path/to/private/google-oauth-client.json"
GOOGLE_OAUTH_TOKEN_PATH = "/absolute/path/to/private/google-oauth-token.json"
# INCLUDE_PUBLISH_SCOPE = "1"
```

After that, open the MCP host in the application repo that needs GA4/GTM configuration and use its reviewed `*.mcp-execution.yaml` as `spec_path`.

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

- **Local OAuth tokens are plaintext** — the token file is restricted to mode `0600` but is not encrypted. Protect it as a credential and use `npm run login` to replace it after revocation or refresh failure.
- **Login requests all runtime scopes** — the stored grant includes read, write, version, and publish scopes. `INCLUDE_PUBLISH_SCOPE` is an operation gate, not a narrower consent mode.
- **GA Admin archive operations are unsupported** — archiving custom dimensions/metrics/key events returns `API_UNSUPPORTED`; no `archive*` functions are exported. Upserts that would change immutable fields (`parameterName`, `scope`) also throw `API_UNSUPPORTED` rather than failing mid-call.
- **Measurement Protocol secrets** — listing returns names/display names only; secret values are stripped at the wrapper boundary and never echoed.
- **GTM 3-workspace-per-container cap** — `create_gtm_workspace` blocks with `WORKSPACE_CAPACITY_BLOCKED` when full; an existing workspace must be merged or deleted first.
- **Diff over-reports `update` for GTM triggers and tags** — current state lacks resolved trigger event names and human-readable trigger names (GTM returns numeric `firingTriggerId`s). The `create`/`unchanged` paths and determinism are unaffected; ID→name resolution is a planned refinement.

## 10. Troubleshooting

- **`SPEC_INVALID` on a spec you believe is valid** — run `validate_mcp_execution_spec` and read the `errors` array; it names the exact path and reason (UA field, secret-shaped key, high-card dimension, per-event-tag explosion, consent change, or missing target ID outside dry-run).
- **OAuth configuration or token validation failed** — confirm both OAuth variables contain absolute paths to regular JSON files and that the token was created for the configured Desktop client; then run `npm run login`.
- **OAuth authorization expired, was revoked, or returned `invalid_grant`** — run `npm run login`, complete consent again, and restart the MCP host. See [login recovery](docs/setup/user-oauth-login.md#recovery).
- **A GA4/GTM API returns `PERMISSION_DENIED` with a valid token** — the operator's user lacks the required product permission. OAuth scopes do not add GA4/GTM roles.
- **`PERMISSION_DENIED` mentioning `INCLUDE_PUBLISH_SCOPE`** — you requested a publish-scoped operation without `INCLUDE_PUBLISH_SCOPE=1`. This is intentional; set it only if you mean to allow publishing.
- **`VERSION_CREATION_BLOCKED` / `PUBLISH_BLOCKED`** — the response lists every unmet condition. Resolve all of them (spec flag, approval token, report paths, environment) — there is no single override.
- **`WORKSPACE_UNSAFE`** — you targeted `workspaceId: "0"` or the default workspace. Create or target a dedicated non-live workspace.
- **`get_gtm_preview_info` returns only a checklist with a `note`** — the GTM API was unreachable (e.g. auth not configured). The manual checklist is still valid; configure credentials to get live workspace metadata.
- **No output on stdout when running the server** — expected. stdio is the MCP transport; logs are on stderr.
