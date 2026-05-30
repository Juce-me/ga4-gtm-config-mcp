# MCP client configuration

This file answers: **where does `GOOGLE_APPLICATION_CREDENTIALS` go, and what is the MCP client?**

## Terms

**MCP server**: this package, launched as `node dist/server.js`. It speaks MCP over stdio.

**MCP client**: the host application that starts the MCP server, such as Claude Desktop, Claude Code, Codex, or another MCP-capable tool.

**OAuth Web client**: a Google Auth Platform client ID/secret used only for the one-time bootstrap flow. It is not the MCP client.

**Runtime credential file**: service-account JSON or external-account/WIF JSON. Its absolute path is passed as `GOOGLE_APPLICATION_CREDENTIALS`.

## Build The Server

```bash
npm install
npm run build
```

The runtime entrypoint is:

```text
/absolute/path/to/ga4-gtm-config-mcp/dist/server.js
```

## Environment Variables

Required for local JSON credentials:

```text
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-or-external-account.json
```

Optional:

```text
ALLOW_GOOGLE_METADATA_AUTH=1
```

Set this only when the intended credential source is a trusted Google metadata server.

Publishing opt-in:

```text
INCLUDE_PUBLISH_SCOPE=1
```

Leave it unset unless publishing through this MCP server is explicitly approved.

## `.env` Is Not Auto-Loaded

`.env` is gitignored and useful for local shell wrappers, but this server does not load `.env` by itself. The MCP client config or the shell process that launches `node dist/server.js` must pass the variables into `process.env`.

If you run from a shell:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-or-external-account.json
npm run mcp
```

If you run from an MCP host, put the variable in that host's MCP server config.

## Claude Desktop / Claude Code Example

For `claude_desktop_config.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "ga4-gtm-config": {
      "command": "node",
      "args": ["/absolute/path/to/ga4-gtm-config-mcp/dist/server.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account-or-external-account.json"
      }
    }
  }
}
```

Publishing remains disabled unless you deliberately add:

```json
"INCLUDE_PUBLISH_SCOPE": "1"
```

## Runtime Scopes Requested By This Server

Scopes are requested least-privilege per operation:

| Mode | Scopes |
|------|--------|
| `read` | `tagmanager.readonly`, `analytics.readonly` |
| `write` | read scopes + `tagmanager.edit.containers`, `analytics.edit` |
| `version` | read scopes + `tagmanager.edit.containerversions` |
| `publish` | write scopes + `tagmanager.publish` |

The bootstrap scopes `analytics.manage.users` and `tagmanager.manage.users` are not runtime scopes. They are used only by `npm run bootstrap:access` with a one-time human-admin token.

## Runtime Auth Checks

At runtime, this server accepts:

- `service_account` JSON
- `external_account` / WIF JSON
- metadata-server credentials only with `ALLOW_GOOGLE_METADATA_AUTH=1`

It rejects:

- `authorized_user` ADC files from `gcloud auth application-default login`
- human OAuth refresh-token operation

## Common Failures

`Runtime auth requires GOOGLE_APPLICATION_CREDENTIALS unless ALLOW_GOOGLE_METADATA_AUTH=1 is explicitly set.`

: The MCP client did not pass the env var, or the shell did not export it.

`Runtime auth rejects authorized_user credentials.`

: The path points to human ADC instead of service-account or WIF credentials.

`credential file not found`

: The MCP client config uses a path that exists in a different shell, repo, or machine. Use an absolute path.

`PERMISSION_DENIED`

: The runtime credential exists, but the service-account email has not been granted GA4/GTM product access. Run [Product access bootstrap](product-access-bootstrap.md).
