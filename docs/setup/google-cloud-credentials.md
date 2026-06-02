# Google Cloud credentials

This file answers: **where do I create the runtime identity, what APIs do I enable, and what credential file does MCP use?**

## Terms

**Google Cloud project**: the project that owns the service account, OAuth client, enabled APIs, and optional WIF setup. It does not have to be the same repo, GA4 account, GTM account, or application product being measured. Pick one operations-owned project and use it consistently.

The project ID belongs in Google Cloud setup commands, not in the local MCP server env block. This server does not read `GOOGLE_CLOUD_PROJECT` or `GCLOUD_PROJECT`; GA4/GTM targets come from the spec and tool arguments.

**Service account**: the non-human Google identity the MCP server runs as. Its email has this shape:

```text
SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com
```

**Service-account JSON key**: a downloadable private key file for local runtime use. It usually has `"type": "service_account"`. Treat it as a secret. Many organizations block key creation through `constraints/iam.disableServiceAccountKeyCreation`; in that case, use WIF or metadata-server credentials instead.

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
SA_NAME="ga4-gtm-mcp"

gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GA4/GTM MCP runtime"

SA_EMAIL="$SA_NAME@PROJECT_ID.iam.gserviceaccount.com"
```

Official reference: [Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create).

## Choose A Runtime Credential Source

Preferred options:

1. Workload Identity Federation for external runtimes such as CI/CD or another cloud.
2. Metadata-server credentials for trusted Google Cloud runtimes.
3. Local impersonated ADC for local real-API testing.
4. Service-account JSON key only when key creation is explicitly allowed and a keyless option is not available.

Do not use `gcloud auth application-default login` as the MCP runtime credential. This project rejects `authorized_user` ADC files so a human refresh token cannot operate the MCP server.

Local testing support accepts **impersonated ADC** only when it is explicitly enabled. That path still runs API calls as the service account and avoids long-lived keys. Plain human-user ADC remains rejected.

## Option A: Use Workload Identity Federation

Use WIF for production, CI/CD, or any external runtime that can authenticate through an OIDC, SAML, AWS, Azure, or similar identity provider. This avoids long-lived Google private keys and works when service-account key creation is blocked by organization policy.

In this project, a WIF credential means a local JSON configuration file that Google Auth can read through `GOOGLE_APPLICATION_CREDENTIALS`. The file is an **external-account credential config**, not a service-account key.

High-level setup:

1. In Google Cloud, create a Workload Identity Pool for the external runtime environment.
2. Create a provider for the external identity source, such as GitHub OIDC, GitLab OIDC, AWS, Azure, Okta, or another OIDC/SAML provider.
3. Allow the external principal to impersonate the MCP service account.
4. Generate an external-account credential config file.
5. Set `GOOGLE_APPLICATION_CREDENTIALS=<external-account-json-path>`.

Official references:

- [Workload Identity Federation overview](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Configure Workload Identity Federation with other providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)
- [Set up ADC for on-premises or another cloud provider](https://docs.cloud.google.com/docs/authentication/set-up-adc-on-premises)
- [Authentication methods at Google](https://docs.cloud.google.com/docs/authentication)

## Option B: Local Impersonated ADC

Use this for local real GA4/GTM API testing with `ALLOW_GOOGLE_IMPERSONATED_ADC=1`.

This is different from plain user ADC:

- plain user ADC runs as the human user and remains rejected;
- impersonated ADC uses the human login only to mint short-lived credentials for the service account;
- GA4/GTM product access must still be granted to the service-account email, not merely to the human user.

Grant the human operator permission to impersonate the service account:

```bash
SA_EMAIL="SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="user:YOUR_GOOGLE_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator"
```

Create the local impersonated ADC file:

```bash
gcloud auth application-default login \
  --impersonate-service-account="$SA_EMAIL"
```

The generated ADC JSON must have top-level `"type": "impersonated_service_account"` and a `source_credentials` object whose `type` is `"authorized_user"`. A top-level `"type": "authorized_user"` file remains rejected even if it contains service-account impersonation metadata.

Then configure the MCP host with both:

```text
GOOGLE_APPLICATION_CREDENTIALS=<expanded-adc-json-path>
ALLOW_GOOGLE_IMPERSONATED_ADC=1
```

In a shell, the default ADC file is usually:

```text
$HOME/.config/gcloud/application_default_credentials.json
```

Use the expanded file path in MCP host JSON because MCP clients do not necessarily expand `$HOME`. Do not put real user names, service-account emails, project IDs, or credential file contents in public docs.

Official references:

- [Use service account impersonation](https://docs.cloud.google.com/docs/authentication/use-service-account-impersonation)
- [Service account impersonation](https://docs.cloud.google.com/iam/docs/service-account-impersonation)

## Option C: Use Metadata-Server Credentials

Use this only when running on trusted Google Cloud infrastructure with an attached runtime service account.

Requirements:

1. Attach the intended service account to the Google Cloud runtime.
2. Grant that service-account email GA4/GTM product access through [Product access bootstrap](product-access-bootstrap.md).
3. Set `ALLOW_GOOGLE_METADATA_AUTH=1`.
4. Do not set `GOOGLE_APPLICATION_CREDENTIALS` unless you intentionally want a JSON credential file instead.

The explicit `ALLOW_GOOGLE_METADATA_AUTH=1` flag exists so local human ADC cannot be silently selected.

## Option D: Create A Local Service-Account JSON Key

Use this only when key creation is allowed and WIF or metadata-server credentials are not practical.

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

Then point the runtime at the gitignored key file:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./secrets/ga4-gtm-mcp.json
```

Official references:

- [Create and delete service account keys](https://docs.cloud.google.com/iam/docs/keys-create-delete)
- [`gcloud iam service-accounts keys create`](https://docs.cloud.google.com/sdk/gcloud/reference/iam/service-accounts/keys/create)

### If Key Creation Is Blocked

This error means organization policy is working as configured:

```text
FAILED_PRECONDITION: Key creation is not allowed on this service account.
type: constraints/iam.disableServiceAccountKeyCreation
```

Do not switch to `gcloud auth application-default login` for this MCP server. That creates an `authorized_user` ADC file, which this server rejects by design.

Use one of these paths instead:

1. Configure WIF and set `GOOGLE_APPLICATION_CREDENTIALS` to the generated external-account JSON.
2. Run the MCP server on Google Cloud with the service account attached and set `ALLOW_GOOGLE_METADATA_AUTH=1`.
3. For local real-API testing, create impersonated ADC and set `ALLOW_GOOGLE_IMPERSONATED_ADC=1`.
4. If a local JSON key is truly required, ask an organization policy administrator for a narrow project or service-account exemption from `constraints/iam.disableServiceAccountKeyCreation`.

Official references:

- [Troubleshoot organization policy errors for service accounts](https://docs.cloud.google.com/iam/docs/troubleshoot-org-policies)
- [Create and delete service account keys: allow key creation](https://docs.cloud.google.com/iam/docs/keys-create-delete#allow_service_account_key_creation)

## Runtime Credential Rules

Accepted runtime credential sources:

- service-account JSON through `GOOGLE_APPLICATION_CREDENTIALS`
- external-account/WIF JSON through `GOOGLE_APPLICATION_CREDENTIALS`
- impersonated ADC with top-level `"type": "impersonated_service_account"` through `GOOGLE_APPLICATION_CREDENTIALS` only when `ALLOW_GOOGLE_IMPERSONATED_ADC=1`
- metadata-server credentials only when `ALLOW_GOOGLE_METADATA_AUTH=1`

Rejected runtime credential source:

- plain `authorized_user` ADC files from `gcloud auth application-default login`

The service account must still receive GA4/GTM product access. Creating a Google Cloud service account alone does not grant access to any GA4 property or GTM container.

## Required Google Cloud Permissions For The Human Operator

The human running the Google Cloud setup needs enough permission in the credential-owning Google Cloud project to:

- enable APIs
- create service accounts
- create service-account keys only if key creation is allowed and WIF or metadata credentials are not used
- create OAuth Web clients for the bootstrap flow

Those are Google Cloud IAM permissions. They are separate from GA4/GTM product permissions.
