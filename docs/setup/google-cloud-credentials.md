# Google Cloud OAuth setup

This guide creates the Google Cloud OAuth client used by the local login. It does not grant GA4 or GTM product access.

## Before you start

Choose a Google Cloud project the operator is allowed to configure. Separately, confirm that the Google user who will run this server already has every intended permission in the target GA4 properties and GTM accounts/containers.

These are independent authorization systems:

- Google Cloud owns API enablement, the OAuth audience, and the Desktop client.
- GA4 and GTM own product access for the operator's Google user.

Creating the Cloud project or OAuth client never adds the user to GA4 or GTM.

## Enable the APIs

Open the [Google Cloud API Library](https://console.cloud.google.com/apis/library), select the intended project, and enable:

| API | Service name |
|-----|--------------|
| Google Analytics Admin API | `analyticsadmin.googleapis.com` |
| Tag Manager API | `tagmanager.googleapis.com` |

Console flow:

1. Open **Google Cloud Console > APIs & Services > Library**.
2. Select the intended project in the project picker.
3. Find each API above and click **Enable**.

## Configure the OAuth audience

Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) for the same Cloud project and configure its branding and audience.

Choose the audience deliberately:

- Choose **Internal** only when the project belongs to a Google Workspace or Cloud Identity organization and every intended operator belongs to that same organization. Internal is not available for an ordinary consumer-owned project.
- Otherwise choose **External**. While an External app is in **Testing**, add each operator as a test user. Because this server requests GA4/GTM API scopes outside Google's basic identity set, that authorization and its refresh token expire seven days after consent.
- For a durable one-time local login, use an eligible Internal app or configure the External app for **In production**. Publishing status and verification are separate: moving an External app to In production removes the Testing-specific seven-day expiry, while verification governs scope approval, warnings, and applicable user caps.

External apps may show an unverified-app warning or be subject to a user cap. Whether verification is required depends on the audience, requested scopes, intended users, and Google's current policy. Do not infer that a local or In-production app is automatically verified.

Current Google references:

- [OAuth overview and refresh-token expiration](https://developers.google.com/identity/protocols/oauth2)
- [OAuth app audience and seven-day Testing behavior](https://support.google.com/cloud/answer/15549945)

## Create a Desktop client

1. Open **Google Auth Platform > Clients**.
2. Click **Create client**.
3. Select application type **Desktop app**.
4. Give the client a recognizable local-operations name.
5. Click **Create**.
6. Download the client JSON.
7. Move it to a private absolute path outside version control, for example:

```text
/absolute/path/to/private/google-oauth-client.json
```

The downloaded file must use Google's Desktop-client JSON shape with a top-level `installed` object. Do not hand-edit it into a Web-client file.

Treat the file as a secret because it contains the OAuth client secret. Do not commit it, paste it into MCP configuration, or share its contents in support output.

## Next step

Continue with [User OAuth login](user-oauth-login.md) to set the two absolute paths and create the local refresh-token record.
