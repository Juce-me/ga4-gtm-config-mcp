# Google Cloud credentials

This file answers: **where do I create the runtime identity, what APIs do I enable, and what credential file does MCP use?**

## Terms

**Google Cloud project**: the project that owns the service account, OAuth client, enabled APIs, and optional WIF setup. It does not have to be the same repo, GA4 account, GTM account, or application product being measured. Pick one operations-owned project and use it consistently.

**Service account**: the non-human Google identity the MCP server runs as. Its email has this shape:

```text
SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com
```

**Service-account JSON key**: a downloadable private key file for local runtime use. It usually has `"type": "service_account"`. Treat it as a secret.

**External-account / WIF credential**: a JSON config file for Workload Identity Federation. It usually has `"type": "external_account"`. It does not contain a Google private key; it tells Google Auth how to exchange an external identity for short-lived Google credentials.

**Metadata-server credentials**: credentials attached to a Google Cloud runtime such as Compute Engine or Cloud Run. This server only accepts them when `ALLOW_GOOGLE_METADATA_AUTH=1` is set.

## Enable Required APIs

Open [Google Cloud API Library](https://console.cloud.google.com/apis/library), select the credential-owning project in the project picker, then enable these APIs:

| API | Service name |
|-----|--------------|
| IAM API | `iam.googleapis.com` |
| IAM Service Account Credentials API | `iamcredentials.googleapis.com` |
| Google Analytics Admin API | `analyticsadmin.googleapis.com` |
| Tag Manager API | `tagmanager.googleapis.com` |

Console path:

1. Open **Google Cloud Console > APIs & Services > Library**.
2. Use the project picker in the top bar to select the credential-owning project.
3. Search for each API name above.
4. Open the API page.
5. Click **Enable**.

CLI equivalent:

```bash
gcloud config set project PROJECT_ID

gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  analyticsadmin.googleapis.com \
  tagmanager.googleapis.com
```

Official reference: [Enable and disable services](https://docs.cloud.google.com/service-usage/docs/enable-disable).

## Create A Service Account

Console path:

1. Open [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Select the credential-owning project in the project picker.
3. Click **Create service account**.
4. Enter a service account name, for example `ga4-gtm-mcp`.
5. Click **Create and continue**.
6. Do not grant broad Google Cloud project roles just for GA4/GTM access. GA4/GTM product access is granted later through the bootstrap CLI.
7. Click **Done**.

CLI equivalent:

```bash
gcloud iam service-accounts create ga4-gtm-mcp \
  --display-name="GA4/GTM MCP runtime"

SA_EMAIL="ga4-gtm-mcp@PROJECT_ID.iam.gserviceaccount.com"
```

Official reference: [Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create).

## Option A: Create A Local Service-Account JSON Key

Use this for local development or a controlled operator machine.

Console path:

1. Open [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Select the credential-owning project.
3. Click the service account email.
4. Open the **Keys** tab.
5. Click **Add key > Create new key**.
6. Select **JSON**.
7. Click **Create**.
8. Move the downloaded file outside public docs and out of git-tracked paths, or into a gitignored `secrets/` directory.

CLI equivalent:

```bash
mkdir -p ./secrets

gcloud iam service-accounts keys create ./secrets/ga4-gtm-mcp.json \
  --iam-account="$SA_EMAIL"
```

Then point the runtime at the absolute path:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/secrets/ga4-gtm-mcp.json
```

Official references:

- [Create and delete service account keys](https://docs.cloud.google.com/iam/docs/keys-create-delete)
- [`gcloud iam service-accounts keys create`](https://docs.cloud.google.com/sdk/gcloud/reference/iam/service-accounts/keys/create)

## Option B: Use Workload Identity Federation

Use WIF for production or CI/CD when you do not want a long-lived Google private key.

In this project, a WIF credential means a local JSON configuration file that Google Auth can read through `GOOGLE_APPLICATION_CREDENTIALS`. The file is an **external-account credential config**, not a service-account key.

High-level setup:

1. In Google Cloud, create a Workload Identity Pool for the external runtime environment.
2. Create a provider for the external identity source, such as GitHub OIDC, GitLab OIDC, AWS, Azure, Okta, or another OIDC/SAML provider.
3. Allow the external principal to impersonate the MCP service account.
4. Generate an external-account credential config file.
5. Set `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/external-account.json`.

Official references:

- [Workload Identity Federation overview](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Configure Workload Identity Federation with other providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)
- [Identities for workloads](https://docs.cloud.google.com/iam/docs/workload-identities)

## Option C: Use Metadata-Server Credentials

Use this only when running on trusted Google Cloud infrastructure with an attached runtime service account.

Requirements:

1. Attach the intended service account to the Google Cloud runtime.
2. Grant that service-account email GA4/GTM product access through [Product access bootstrap](product-access-bootstrap.md).
3. Set `ALLOW_GOOGLE_METADATA_AUTH=1`.
4. Do not set `GOOGLE_APPLICATION_CREDENTIALS` unless you intentionally want a JSON credential file instead.

The explicit `ALLOW_GOOGLE_METADATA_AUTH=1` flag exists so local human ADC cannot be silently selected.

## Runtime Credential Rules

Accepted runtime credential sources:

- service-account JSON through `GOOGLE_APPLICATION_CREDENTIALS`
- external-account/WIF JSON through `GOOGLE_APPLICATION_CREDENTIALS`
- metadata-server credentials only when `ALLOW_GOOGLE_METADATA_AUTH=1`

Rejected runtime credential source:

- `authorized_user` ADC files from `gcloud auth application-default login`

The service account must still receive GA4/GTM product access. Creating a Google Cloud service account alone does not grant access to any GA4 property or GTM container.

## Required Google Cloud Permissions For The Human Operator

The human running the Google Cloud setup needs enough permission in the credential-owning Google Cloud project to:

- enable APIs
- create service accounts
- create service-account keys, unless WIF or metadata credentials are used
- create OAuth Web clients for the bootstrap flow

Those are Google Cloud IAM permissions. They are separate from GA4/GTM product permissions.
