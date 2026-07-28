# Setup overview

This server uses one local Google user OAuth grant. Keep these boundaries separate:

| Item | Purpose | What it does not do |
|------|---------|---------------------|
| Google Cloud project | Owns the OAuth consent configuration, Desktop client, and enabled APIs | Does not grant access to a GA4 property or GTM account/container |
| OAuth Desktop client | Identifies this local application during browser login | Does not carry GA4/GTM product permissions |
| Operator's Google user | Authorizes the requested API scopes and performs GA4/GTM operations | Does not gain product access through OAuth |
| MCP client | Starts `node dist/server.js` and passes private absolute file paths | Is not the Google OAuth client |

The operator's Google user account must already have the intended permissions in every target GA4 property and GTM account/container. Google OAuth authorizes API use as that user; it does not add the user to either product.

## Required flow

1. In a Google Cloud project, enable the Google Analytics Admin API and Tag Manager API.
2. Configure the Google Auth Platform audience and create an OAuth client with application type **Desktop app**.
3. Download the client JSON to a private local path.
4. Set `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH` to absolute paths.
5. Run `npm run login`, open the printed URL, and authorize with the operator's Google user.
6. Configure the MCP host with the same two absolute paths.
7. Run MCP tools against reviewed `*.mcp-execution.yaml` specs.

## Migrate from workload authentication

If an existing MCP launcher still uses the former workload-auth setup:

1. Remove the legacy <code>GOOGLE_APPLICATION&#95;CREDENTIALS</code> entry and every <code>ALLOW_GOOGLE_*</code> entry from the launcher environment.
2. Complete [Google Cloud OAuth setup](google-cloud-credentials.md) and download a Desktop OAuth client JSON.
3. Store the Desktop client JSON and token destination at private absolute paths.
4. Set `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH` to those paths.
5. Run `npm run login` and complete browser consent as the operator whose existing GA4/GTM permissions the server should use.
6. Restart the MCP host so it drops the old environment and loads the new OAuth files.

Do not leave both credential models configured. The current runtime reads only the two user-OAuth paths.

Read the focused guides in order:

- [Google Cloud OAuth setup](google-cloud-credentials.md)
- [User OAuth login](user-oauth-login.md)
- [MCP client configuration](mcp-client-configuration.md)
- [Application project integration](application-project-integration.md)

## Security boundary

The downloaded client JSON contains an OAuth client secret, and the generated token file contains a plaintext refresh token. Keep both outside version control, restrict access to the operator, and never paste either into docs, specs, issue reports, logs, or MCP tool arguments.

Login requests the complete scope set needed for read, write, container-version, and publish modes. Google consent is therefore broader than a read-only session even when publishing is operationally disabled. `INCLUDE_PUBLISH_SCOPE` is a separate runtime gate: leaving it unset blocks publish mode, but it does not remove the publish scope from the stored grant.

## Audience and token lifetime

- **Internal** is available only when the Cloud project belongs to a Google Workspace or Cloud Identity organization and the intended user belongs to that organization.
- **External** in **Testing** requires test users for these non-basic GA4/GTM scopes. Their authorizations and refresh tokens expire after seven days.
- A durable one-time local login therefore requires either an eligible **Internal** app or an **External** app configured for **In production**.
- Durable does not mean permanent. Revocation, inactivity, account policy, and other Google conditions can still invalidate a refresh token.
- Verification requirements, warning screens, and user caps depend on the audience, publishing status, and requested scopes. Follow Google's current policy for the intended users.

Current Google references:

- [OAuth overview and refresh-token expiration](https://developers.google.com/identity/protocols/oauth2)
- [OAuth app audience and seven-day Testing behavior](https://support.google.com/cloud/answer/15549945)

## Placeholder policy

Public examples use placeholders only. Never add a real OAuth client ID or secret, refresh token, email, Google Cloud project ID, GA4 account/property/stream ID, GTM account/container/workspace/version ID, or machine-specific path.
