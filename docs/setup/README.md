# Setup overview

This setup has three different identities. Keep them separate:

| Name | What it is | Where it lives | What it is used for | Stored by MCP? |
|------|------------|----------------|---------------------|----------------|
| **Service account** | Google workload identity such as `SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com` | Google Cloud project | The MCP server's runtime identity | Yes, as service-account JSON or WIF config path |
| **OAuth Web client** | Client ID + client secret for an OAuth consent flow | Google Auth Platform in a Google Cloud project | Lets OAuth Playground mint one short-lived human-admin access token | No |
| **Human admin user** | A real Google user with GA4/GTM user-management rights | Google Account / Workspace | Approves the one-time OAuth bootstrap token | No |
| **MCP client** | Claude Desktop, Claude Code, Codex, or another MCP host | Operator machine | Starts `node dist/server.js` over stdio and passes environment variables | N/A |

The MCP server must run as a workload identity. It must not run as a human user refresh token.

## Entity Boundaries

These are separate things and may be owned by different teams:

| Entity | Example placeholder | Purpose |
|--------|---------------------|---------|
| Google Cloud project | `PROJECT_ID` | Owns service accounts, OAuth clients, WIF pools, enabled APIs |
| Service account | `SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com` | Runtime identity for the MCP server |
| GA4 property | `properties/GA4_PROPERTY_ID` | Analytics Admin API target |
| GTM account/container | `GTM_ACCOUNT_ID` / `GTM_CONTAINER_ID` | Tag Manager API target |
| Application repo | product source repo | Owns instrumentation and reviewed `*.mcp-execution.yaml` specs |
| Operator machine / MCP host | Claude Desktop, Claude Code, Codex, CI runner | Starts this MCP server and passes credential env vars |

The Google Cloud project does **not** automatically grant access to GA4 or GTM. Product access is granted separately by [Product access bootstrap](product-access-bootstrap.md).

## Required Flow

1. Create a Google Cloud runtime credential:
   - service-account JSON for local/small deployments, or
   - external-account / Workload Identity Federation JSON for keyless production.
2. Enable the required APIs in the Google Cloud project that owns that credential.
3. Use a human GA4/GTM admin only once to create a short-lived OAuth access token.
4. Run `npm run bootstrap:access` to grant product-level GA4/GTM access to the service-account email.
5. Configure the MCP client to pass `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/credential.json` for runtime authentication.
6. Run MCP tools against reviewed `*.mcp-execution.yaml` specs.

`GOOGLE_APPLICATION_CREDENTIALS` is not the product-access grant. It is only how the MCP process authenticates as the workload identity after GA4/GTM access has been granted separately.

## Read Next

- [Google Cloud credentials](google-cloud-credentials.md) explains the service account, service-account key, WIF credential, API enablement, and exact Cloud Console pages.
- [Product access bootstrap](product-access-bootstrap.md) explains the OAuth Web client, OAuth Playground, one-time access token, and bootstrap CLI.
- [MCP client configuration](mcp-client-configuration.md) explains where `GOOGLE_APPLICATION_CREDENTIALS` goes for the MCP host.
- [Application project integration](application-project-integration.md) explains what other app repos must provide and what they must not store.

## Product Permissions Granted By Bootstrap

The current bootstrap CLI grants:

- GA4 property access binding: `predefinedRoles/editor`
- GTM account user permission: `accountAccess.permission = user`
- GTM container permission: `edit`

Run bootstrap once per GA4 property / GTM container pair that the service account must manage.

## What Never Goes In Public Docs

Use placeholders for:

- Google Cloud project IDs
- GA4 account/property/stream IDs
- GTM account/container/workspace/version IDs
- service-account emails
- OAuth client IDs/secrets
- access tokens, refresh tokens, private keys
