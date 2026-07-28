# MCP client configuration

The MCP client is the local host application that starts this package as a stdio server. It is separate from the Google OAuth Desktop client.

Complete [User OAuth login](user-oauth-login.md) before registering the server. The same two private absolute paths must be available to both `npm run login` and the MCP process.

## Build the server

```bash
npm install
npm run build
```

The runtime entrypoint is:

```text
/absolute/path/to/ga4-gtm-config-mcp/dist/server.js
```

## Environment variables

Required:

```text
GOOGLE_OAUTH_CLIENT_SECRETS=/absolute/path/to/private/google-oauth-client.json
GOOGLE_OAUTH_TOKEN_PATH=/absolute/path/to/private/google-oauth-token.json
```

Optional operation gate:

```text
INCLUDE_PUBLISH_SCOPE=1
```

Leave `INCLUDE_PUBLISH_SCOPE` unset unless publish operations are explicitly approved. Login already requests the publish scope; this variable only allows runtime publish mode and does not acquire or remove OAuth scopes.

The server does not auto-load `.env`. The MCP host or launching shell must pass these variables. It also does not read Google Cloud project or GA4/GTM target-ID environment variables; targets come from the reviewed spec and explicit tool arguments.

## JSON MCP host example

Use absolute paths for the Node executable, built server, client JSON, and token file:

```json
{
  "mcpServers": {
    "ga4-gtm-config": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/ga4-gtm-config-mcp/dist/server.js"
      ],
      "env": {
        "GOOGLE_OAUTH_CLIENT_SECRETS": "/absolute/path/to/private/google-oauth-client.json",
        "GOOGLE_OAUTH_TOKEN_PATH": "/absolute/path/to/private/google-oauth-token.json"
      }
    }
  }
}
```

This shape applies to MCP hosts that use a JSON `mcpServers` configuration. Consult the host's current documentation for the location of that private config.

To permit publish mode, deliberately add this environment entry:

```json
"INCLUDE_PUBLISH_SCOPE": "1"
```

That single setting does not authorize a publish call by itself; all server publish guards still apply.

## Codex TOML example

After `npm run build`, add a private local configuration using only absolute paths:

```toml
[mcp_servers.ga4-gtm-config]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/ga4-gtm-config-mcp/dist/server.js"]

[mcp_servers.ga4-gtm-config.env]
GOOGLE_OAUTH_CLIENT_SECRETS = "/absolute/path/to/private/google-oauth-client.json"
GOOGLE_OAUTH_TOKEN_PATH = "/absolute/path/to/private/google-oauth-token.json"
# INCLUDE_PUBLISH_SCOPE = "1"
```

Run the MCP host from the application repo and pass that repo's reviewed `*.mcp-execution.yaml` as `spec_path`.

## Shell smoke test

For a direct local launch:

```bash
export GOOGLE_OAUTH_CLIENT_SECRETS=/absolute/path/to/private/google-oauth-client.json
export GOOGLE_OAUTH_TOKEN_PATH=/absolute/path/to/private/google-oauth-token.json
npm run mcp
```

The server speaks MCP over stdout, so an interactive shell will not show normal human-readable output there. Structured logs go to stderr.

## Runtime scope checks

The stored token must include the complete scope set obtained by `npm run login`. Each operation checks its required subset before refreshing the token:

| Mode | Required scopes |
|------|-----------------|
| read | `tagmanager.readonly`, `analytics.readonly` |
| write | read scopes plus `tagmanager.edit.containers`, `analytics.edit` |
| version | read scopes plus `tagmanager.edit.containerversions` |
| publish | write scopes plus `tagmanager.publish` and `INCLUDE_PUBLISH_SCOPE=1` |

The operator's GA4/GTM product permissions remain an additional boundary. Possessing the requested OAuth scopes does not create or elevate those permissions.

## Common failures

MCP tools serialize authentication failures with this public shape:

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "User OAuth configuration or token validation failed.",
    "details": {
      "reason": "client_secrets_path_missing"
    }
  }
}
```

The `details.reason` value is a stable redacted code. Configuration and token loading may return:

- path reasons: `client_secrets_path_missing`, `token_path_missing`, `client_secrets_path_not_absolute`, `token_path_not_absolute`;
- file reasons: `client_secrets_unreadable`, `token_unreadable`, `client_secrets_not_regular`, `token_not_regular`, `client_secrets_invalid_json`, `token_invalid_json`;
- Desktop-client reasons: `desktop_client_missing`, `client_id_missing`, `client_secret_missing`; or
- token-record reasons: `token_invalid`, `token_missing_fields`, `token_unknown_fields`, `token_refresh_token_invalid`, `token_scopes_invalid`, `token_scopes_empty`, `token_scope_invalid`, `token_scopes_duplicate`, `token_client_id_invalid`, `token_timestamp_invalid`, `token_client_id_mismatch`.

The payload never includes a credential path, token value, client secret, or raw Google response. Correct the absolute paths or run `npm run login`, depending on the reason.

### Direct login failure

When `npm run login` fails, the command exits nonzero and its final diagnostic is the generic, secret-safe line:

```text
User OAuth login failed.
```

An authorization URL may already have appeared before a later failure. The final diagnostic deliberately does not print the internal stable reason or raw provider error. Check both absolute paths and the Desktop-client file, then retry the browser flow. A timeout, rejected consent, invalid callback, incomplete scope grant, missing refresh token, or local token-write failure all use this same public CLI message.

### Stored grant lacks a required scope

`Stored Google OAuth grant does not cover ... mode. Run npm run login.`

: This is `PERMISSION_DENIED` with `details.reason = "missing_required_scopes"`. The token predates the current all-scope login or consent was incomplete. Run `npm run login` and approve the complete requested scope set.

### Authorization revoked or expired

`Google OAuth authorization expired or was revoked. Run npm run login.`

: This is `PERMISSION_DENIED` with an empty `details` object after Google returns `invalid_grant`. Follow [User OAuth login: Recovery](user-oauth-login.md#recovery), replace the token, and restart the MCP host.

### Generic refresh failure

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Google OAuth token refresh failed. Run npm run login.",
    "details": {
      "reason": "oauth_refresh_failed"
    }
  }
}
```

The server intentionally replaces the provider error with this stable shape. Run `npm run login`, replace the token, and restart the MCP host.

### Product permission failure

`PERMISSION_DENIED` from a GA4 or GTM API call

: The OAuth token is valid, but the operator's Google user lacks the required permission in the target product. Have an authorized product administrator grant the intended GA4/GTM role, then retry.

### Publish mode disabled

`Publish mode requires INCLUDE_PUBLISH_SCOPE=1.`

: Publish mode is operationally disabled. Set the variable only after explicit approval; it does not bypass the remaining publish gates.
