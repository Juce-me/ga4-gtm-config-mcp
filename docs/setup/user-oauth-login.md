# User OAuth login

This login authorizes the server to call GA4 and GTM APIs as the operator's Google user. The user's existing GA4/GTM roles determine what the calls may do; OAuth does not grant product access.

## Prerequisites

Before login:

1. Complete [Google Cloud OAuth setup](google-cloud-credentials.md).
2. Confirm the operator's Google user already has the intended permissions in every target GA4 property and GTM account/container.
3. Download the OAuth **Desktop app** client JSON to private local storage.
4. Choose a private destination for the generated token record.

The client JSON and token destination must be different regular files. Both environment variables must contain absolute paths:

```bash
export GOOGLE_OAUTH_CLIENT_SECRETS=/absolute/path/to/private/google-oauth-client.json
export GOOGLE_OAUTH_TOKEN_PATH=/absolute/path/to/private/google-oauth-token.json
```

Do not use `~`, `$HOME`, or relative paths. MCP hosts may start the server with a different working directory and may not perform shell expansion.

## Run login

Install and build if needed, then start the browser authorization flow:

```bash
npm install
npm run login
```

The command:

1. validates the downloaded Desktop-client JSON;
2. starts a loopback callback listener on `127.0.0.1` with an ephemeral port;
3. prints one Google authorization URL to stderr;
4. requests offline access with PKCE and explicit consent;
5. waits up to five minutes for the callback;
6. validates that every required scope was granted; and
7. writes the new refresh-token record to `GOOGLE_OAUTH_TOKEN_PATH`.

Open the printed URL in a browser, sign in as the intended operator, review the requested access, and complete consent. The browser then reports that authorization completed.

Login requests the complete scope set used by this server:

- `analytics.readonly`
- `analytics.edit`
- `tagmanager.readonly`
- `tagmanager.edit.containers`
- `tagmanager.edit.containerversions`
- `tagmanager.publish`

The token therefore represents broad GA4/GTM authority, subject to the user's product roles and the server's safety gates.

## Token storage and replacement

The token record contains a plaintext refresh token plus the granted scopes, OAuth client ID, and acquisition timestamp. The login command:

- creates missing token-parent directories with mode `0700`;
- creates the token file with mode `0600`;
- writes through a private temporary file and atomically replaces the destination; and
- rejects symlinks and non-regular credential files.

These controls reduce accidental local exposure; they do not encrypt the token. Anyone who can read the file may be able to act with the stored OAuth grant. Keep it on a trusted operator machine, exclude it from backups or syncing where appropriate, and never commit, print, or attach it to a support report.

Running `npm run login` again obtains a fresh grant and replaces the token file at the same absolute path. Use re-login after changing OAuth clients, changing requested access, revoking the grant, or receiving refresh-token failures.

## Publish scope and operation gate

Login always requests `tagmanager.publish` along with all other runtime scopes. `INCLUDE_PUBLISH_SCOPE` is not a scope-acquisition switch and does not narrow the stored grant.

At runtime, publish-mode authentication fails closed unless:

```text
INCLUDE_PUBLISH_SCOPE=1
```

Even with that value, publishing still requires the spec-level publish flag, a per-call approval token, validation evidence, the environment match, and every other publish guard. Leave the variable unset unless publish operations are explicitly approved.

## Audience, publishing, and refresh-token lifetime

- **Internal** is available only to a Google Workspace or Cloud Identity organization-owned project and users in that organization.
- **External** in **Testing** requires operators to be listed as test users. Because the GA4/GTM scopes above are not all basic identity scopes, those authorizations and refresh tokens expire after seven days.
- A durable one-time local login needs either an eligible Internal app or an External app configured for **In production**.
- Moving an External app to In production is separate from verification. Unverified-app warnings, verification requirements, and user caps depend on the audience and requested scopes; follow Google's current policy.
- Refresh tokens can still expire or be revoked for other reasons, so the operator must retain a re-login path.

Current Google references:

- [OAuth overview and refresh-token expiration](https://developers.google.com/identity/protocols/oauth2)
- [OAuth app audience and seven-day Testing behavior](https://support.google.com/cloud/answer/15549945)

## Recovery

If the MCP server reports that authorization expired, was revoked, or failed with `invalid_grant`:

1. Confirm the Desktop client JSON still exists at `GOOGLE_OAUTH_CLIENT_SECRETS`.
2. Confirm the operator still has the required GA4/GTM product permissions.
3. Run `npm run login` with the same absolute token destination.
4. Complete consent again.
5. Restart the MCP host so subsequent processes read the replaced token.

If no refresh token is returned, revoke the app's prior grant in the operator's Google Account permissions and run login again. Revocation invalidates the old grant; do not expect the previous token file to recover.

If login fails because a requested scope was not granted, repeat the flow and accept the complete scope set. The server refuses partial grants instead of silently running with unpredictable capabilities.

## Decommissioning local access

The token remains on disk until login replaces it or the operator deletes it; the server does not export or centrally retain it. To remove local access, stop the MCP host, revoke the app grant in the operator's Google Account permissions, and delete the local token file. Remove the downloaded client JSON as well if this machine will no longer perform login. Apply the same deletion policy to any private backup that contained either file.
