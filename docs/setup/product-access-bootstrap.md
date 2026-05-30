# Product access bootstrap

This file answers: **how does the service account get GA4/GTM access if the UI user flow cannot add it reliably?**

Use the official user-management APIs. A human admin creates one short-lived OAuth access token, the bootstrap CLI uses that token once, and then the MCP runtime uses only the service account or WIF credential.

## Terms

**Human admin user**: a Google user who already has permission to manage users in the target GA4 property and GTM account/container.

**OAuth Web client**: a Google Auth Platform client ID + secret used only by OAuth Playground to obtain a short-lived human-admin access token. Create it in the credential-owning Google Cloud project. It is not the MCP client.

**One-time access token**: the `Access token` field returned by OAuth Playground after exchanging the authorization code. Do not copy or store the refresh token.

**Product access**: GA4 access binding and GTM user permission. This is separate from Google Cloud IAM roles.

## Create The OAuth Web Client

Open these pages and make sure the intended Google Cloud project is selected:

- [Google Auth Platform overview](https://console.cloud.google.com/auth/overview)
- [Google Auth Platform clients](https://console.cloud.google.com/auth/clients)
- [Google Auth Platform branding](https://console.cloud.google.com/auth/branding)
- [Google Auth Platform audience / test users](https://console.cloud.google.com/auth/audience)
- [Classic APIs & Services credentials page](https://console.cloud.google.com/apis/credentials)

Click path:

1. Open **Google Auth Platform > Clients**.
2. If Google asks you to configure Auth first, open **Branding**.
3. Enter a minimal app name such as `GA4 GTM MCP Bootstrap`.
4. Enter a user support email and developer contact email.
5. Open **Audience**.
6. Use **Internal** only if the human GA4/GTM admin belongs to the same Google Workspace organization as the Cloud project.
7. Otherwise use **External** in Testing and add the human GA4/GTM admin email as a test user.
8. Return to **Clients**.
9. Click **Create client**.
10. Choose **Web application**.
11. Add this authorized redirect URI:

```text
https://developers.google.com/oauthplayground
```

12. Click **Create**.
13. Copy the `Client ID` and `Client secret` from the creation dialog.

If the dialog was closed:

1. Return to [Google Auth Platform clients](https://console.cloud.google.com/auth/clients).
2. Click the Web application client.
3. Copy the `Client ID`.
4. If the full `Client secret` is hidden, create a new secret or create a replacement Web application client.

Do not put the OAuth client secret in `.env`, MCP client config, source, docs, or audit logs.

Official references:

- [Manage OAuth clients](https://support.google.com/cloud/answer/15549257)
- [Manage app audience and test users](https://support.google.com/cloud/answer/15549945)
- [OAuth scopes and app verification](https://developers.google.com/identity/protocols/oauth2/scopes)

## Get The One-Time Admin Access Token

Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).

Click path:

1. Click the gear icon.
2. Enable **Use your own OAuth credentials**.
3. Set **OAuth flow** to **Server-side**.
4. If **Access type** is shown, set it to **Online**.
5. Paste the OAuth Web client ID and client secret.
6. Close settings.
7. In **Step 1 - Select & authorize APIs**, paste these exact scopes into the manual scope input:

```text
https://www.googleapis.com/auth/analytics.manage.users
https://www.googleapis.com/auth/tagmanager.manage.users
```

8. Click **Authorize APIs**.
9. Sign in as the human GA4/GTM admin.
10. Accept the consent prompt.
11. In **Step 2 - Exchange authorization code for tokens**, click **Exchange authorization code for tokens**.
12. Copy only the `Access token` value.

Do not copy:

- `Refresh token`
- `ID token`
- authorization code
- scope URL

If the access token expires before bootstrap completes, repeat the OAuth Playground flow and use a fresh access token.

Official references:

- [OAuth Playground setup with your own OAuth client](https://developers.google.com/search-ads/reporting/concepts/oauth-playground)
- [OAuth web-server flow: access tokens vs refresh tokens](https://developers.google.com/identity/protocols/oauth2/web-server)

## Find Target IDs

Use placeholders in public docs. Keep real IDs in private operator config.

GA4 property ID:

- In a GA4 URL, the property ID is the number after `p`.
- API format is `properties/GA4_PROPERTY_ID`.
- UI path: open GA4, click **Admin**, select the property, then open **Property details** and copy the property ID.

GTM account and container IDs:

- In a GTM URL, use the numeric account ID after `/accounts/`.
- Use the numeric container ID after `/containers/`.
- The public container ID such as `GTM-XXXXXXX` is not used for this permission call.
- UI path: open GTM, select the account/container, then open **Admin > Container Settings**. Use the numeric account/container IDs for API calls.

## Run Bootstrap

Dry-run first:

```bash
npm run bootstrap:access -- \
  --service-account-email SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com \
  --ga4-property properties/GA4_PROPERTY_ID \
  --gtm-account GTM_ACCOUNT_ID \
  --gtm-container GTM_CONTAINER_ID
```

Paste the OAuth Playground `Access token` when prompted.

If the dry-run output is correct, apply:

```bash
npm run bootstrap:access -- \
  --service-account-email SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com \
  --ga4-property properties/GA4_PROPERTY_ID \
  --gtm-account GTM_ACCOUNT_ID \
  --gtm-container GTM_CONTAINER_ID \
  --apply
```

For GA4-only bootstrap, add `--skip-gtm` and omit GTM IDs. For GTM-only bootstrap, add `--skip-ga4` and omit the GA4 property.

The bootstrap CLI:

- reads the access token from stdin
- uses it in memory
- prints redacted summaries
- is not exposed as an MCP tool
- does not store a refresh token

Current default grants:

- GA4 property access binding: `predefinedRoles/editor`
- GTM account access: `user`
- GTM container permission: `edit`

Bootstrap-only scopes:

| Purpose | Scope |
|---------|-------|
| GA4 access bootstrap | `https://www.googleapis.com/auth/analytics.manage.users` |
| GTM access bootstrap | `https://www.googleapis.com/auth/tagmanager.manage.users` |

## Verify Product Access

GA4:

1. Open the target GA4 property.
2. Open **Admin > Property access management**.
3. Confirm the service-account email appears with the expected role.

GTM:

1. Open the target GTM account/container.
2. Open **Admin > User Management**.
3. Confirm the service-account email appears.
4. Confirm the target container has `edit` permission.

## API Proof

- [GA4 `properties.accessBindings.create` requires `analytics.manage.users`](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings/create)
- [GA4 `AccessBinding` roles and user field](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings)
- [GTM `accounts.user_permissions.create` requires `tagmanager.manage.users`](https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.user_permissions/create)
- [GTM `UserPermission` fields](https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.user_permissions)
- [GTM API authorization scopes](https://developers.google.com/tag-platform/tag-manager/api/v2/authorization)

## UI Limitation Proof

- [GA4 UI add-users flow expects a Google Account or Google Workspace Account](https://support.google.com/analytics/answer/9305788)
- [GTM UI user-management flow delegates access to Google accounts and sends invitations](https://support.google.com/tagmanager/answer/6107011)

This is why bootstrap uses the APIs instead of relying on the UI flow for `*.iam.gserviceaccount.com` identities.
