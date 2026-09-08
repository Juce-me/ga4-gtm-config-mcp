# User OAuth login

This guide acquires local user ADC through gcloud. The operator identity's existing GA4/GTM roles determine what the server can access.

| Item | Purpose | What it does not do |
|---|---|---|
| ADC | Supplies a Google identity and OAuth scopes to Google Auth Library | Does not grant GA4 property or GTM account/container roles |
| Operator identity | Holds the existing GA4/GTM product permissions | Does not require a runtime Google Cloud project ID |
| MCP host | Starts the local stdio server | Does not acquire or store Google credentials for the server |
| Execution spec | Declares reviewed desired state and target resources | Never contains credentials or secret values |

## Prerequisites

Install the gcloud CLI, complete the acquisition-only Desktop-client setup in [Google Cloud credentials](google-cloud-credentials.md), and confirm that the intended operator already has the necessary GA4 and GTM product permissions. Keep the downloaded client JSON outside all repositories.

## Run the supported login flow

Use an absolute path to the Desktop client JSON:

```bash
npm install
npm run login -- --client-id-file=/absolute/path/to/oauth-client.json
```

Keep this command active. It opens or prints a browser authorization flow; sign in as the intended operator and finish consent. gcloud then writes user ADC to its standard location. The client JSON is consumed by gcloud only during acquisition; the runtime server does not read it.

`npm run login` delegates to `gcloud auth application-default login --disable-quota-project` with the complete runtime scope union and gcloud's required `cloud-platform` scope. `cloud-platform` remains in that gcloud scope list because it is required for this custom-scope user-ADC flow; runtime mode scope arrays remain unchanged.

Bare `npm run login` is available as a best-effort convenience. It uses gcloud's built-in OAuth client, which can warn about or reject custom Analytics scopes. Use the `--client-id-file` form above when custom-scope user ADC is required.

## Safe verification

Check that gcloud can obtain an ADC access token without displaying or recording it:

```bash
gcloud auth application-default print-access-token > /dev/null
```

Do not display, paste, save, or attach the token. A successful command exit confirms only that gcloud can obtain ADC; it does not prove GA4/GTM product access.

## Recovery

If the server reports that ADC is unavailable or invalid, repeat the supported login command and complete browser consent again. Restart the MCP host after ADC is refreshed.

If gcloud warns that its built-in client cannot support the requested custom Analytics scopes, use the supported `--client-id-file=/absolute/path/to/oauth-client.json` form. If a browser sign-in selects the wrong Google user, rerun login and choose the operator who has the intended GA4/GTM roles.

If access to a target still fails after successful ADC verification, confirm the target argument and the operator's existing GA4 property or GTM account/container role. OAuth scopes do not grant those product roles.

## Publish gate

Login acquires the runtime scope union. `INCLUDE_PUBLISH_SCOPE=1` separately gates publish-mode operations; it does not change scope acquisition or bypass the remaining publish guards. Leave it unset unless publishing is explicitly approved.
