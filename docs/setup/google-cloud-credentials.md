# Google Cloud credentials

This guide explains how the server obtains Application Default Credentials (ADC). It does not create GA4 or GTM product permissions.

| Item | Purpose | What it does not do |
|---|---|---|
| ADC | Supplies a Google identity and OAuth scopes to Google Auth Library | Does not grant GA4 property or GTM account/container roles |
| Operator identity | Holds the existing GA4/GTM product permissions | Does not require a runtime Google Cloud project ID |
| MCP host | Starts the local stdio server | Does not acquire or store Google credentials for the server |
| Execution spec | Declares reviewed desired state and target resources | Never contains credentials or secret values |

The server does not read or require a Google Cloud project ID for GA4 Admin or GTM API calls. ADC supplies the identity; OAuth scopes authorize API capabilities; existing GA4/GTM product roles authorize access to the target resources.

## ADC source precedence

For the sources documented here, Google Auth Library resolves ADC in this order: an explicitly selected `GOOGLE_APPLICATION_CREDENTIALS` file, gcloud's well-known local user-ADC file, then an attached Google-hosted runtime identity. Set the optional `GOOGLE_APPLICATION_CREDENTIALS` environment variable only when selecting an alternate ADC credential file, and use an absolute path:

```text
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/private/application-default-credentials.json
```

When it is unset, the normal local user-ADC source is gcloud's well-known ADC location. Other standard ADC sources, including an environment-provided workload identity, may be appropriate for a managed runtime. The server does not accept an OAuth client JSON as a runtime credential file.

For service-account impersonation, use a standard ADC configuration that instructs Google Auth Library to impersonate the approved service account. The impersonated identity must itself have the required GA4/GTM product roles. Do not add service-account keys or impersonation configuration to an execution spec or application repository.

## Supported local user-ADC acquisition

The supported local flow uses gcloud and an acquisition-only Desktop OAuth client:

1. In the Google Cloud project used for OAuth setup, enable Google Analytics Admin API and Tag Manager API.
2. In Google Auth Platform, configure the intended audience and create an application type **Desktop app** client.
3. Store the downloaded JSON outside repositories at an absolute private path, such as `/absolute/path/to/oauth-client.json`.
4. Run the [login command](user-oauth-login.md) with `--client-id-file`.

The client JSON identifies gcloud during browser acquisition only. It is not passed to the MCP host or read by the runtime server. Treat it as sensitive and do not copy its contents into documentation, specs, logs, or tracked configuration.

## Scope acquisition

`npm run login` delegates to `gcloud auth application-default login --disable-quota-project` with the complete runtime scope union plus gcloud's required `cloud-platform` scope. The command stays active while the operator finishes browser authorization and writes standard user ADC. Bare `npm run login` uses the built-in gcloud client and is best-effort for custom Analytics scopes. Keep `cloud-platform` in gcloud's scope list because gcloud requires it for the custom-scope user-ADC flow; runtime mode scope arrays remain unchanged.

ADC and OAuth scopes authorize API capability, but they do not add GA4 property or GTM account/container roles. Select the operator identity deliberately and confirm its existing product permissions before use.

## No runtime project input

Do not add a Google Cloud project ID to server or MCP-host runtime configuration for GA4/GTM calls. The Cloud project can be needed to administer OAuth setup or APIs, but it is not a runtime GA4/GTM input. Target resources belong in the reviewed execution spec and explicit tool arguments.

## Next step

Continue with [User OAuth login](user-oauth-login.md).
