# MCP client configuration

The MCP host starts this local stdio server. It does not acquire or store Google credentials for the server.

| Item | Purpose | What it does not do |
|---|---|---|
| ADC | Supplies a Google identity and OAuth scopes to Google Auth Library | Does not grant GA4 property or GTM account/container roles |
| Operator identity | Holds the existing GA4/GTM product permissions | Does not require a runtime Google Cloud project ID |
| MCP host | Starts the local stdio server | Does not acquire or store Google credentials for the server |
| Execution spec | Declares reviewed desired state and target resources | Never contains credentials or secret values |

Build after completing [user ADC login](user-oauth-login.md):

```bash
npm install
npm run build
```

The server starts without resolving ADC. It resolves ADC only when a tool needs Google access, so a missing or invalid ADC source is reported for that operation rather than at MCP-host startup.

## JSON MCP-host example

Use absolute paths for Node and the built server entrypoint. Do not add an environment block to use well-known local ADC.

```json
{
  "mcpServers": {
    "ga4-gtm-config": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/ga4-gtm-config-mcp/dist/server.js"]
    }
  }
}
```

To select an alternate standard ADC source, add only the optional selector below. It must identify a valid standard ADC credential file, not an OAuth client JSON:

```json
{
  "env": {
    "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/private/application-default-credentials.json"
  }
}
```

To permit publish-mode operations after explicit approval, add the separately gated setting:

```json
{
  "env": {
    "INCLUDE_PUBLISH_SCOPE": "1"
  }
}
```

`INCLUDE_PUBLISH_SCOPE=1` is an operation gate only. It neither acquires scopes nor bypasses the spec-level approval, approval token, validation, environment, and other publish guards.

## Runtime behavior and failures

The server passes the unchanged mode-specific scope arrays to Google Auth Library: read uses the read scopes; write adds container-edit and Analytics-edit scopes; version adds container-version-edit; publish adds the publish scope and requires `INCLUDE_PUBLISH_SCOPE=1`.

An unavailable or invalid ADC source produces the secret-safe MCP error shape:

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Google Application Default Credentials are unavailable or invalid. Run the documented npm run login command or configure valid ADC.",
    "details": {
      "reason": "adc_unavailable"
    }
  }
}
```

Run the [recovery flow](user-oauth-login.md#recovery) or configure valid standard ADC, then retry. A valid ADC identity and OAuth scopes still do not grant GA4/GTM product roles.
