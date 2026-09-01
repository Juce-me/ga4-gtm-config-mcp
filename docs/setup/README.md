# Setup overview

This is the end-to-end setup order for the local ADC-based server. Keep these boundaries separate:

| Item | Purpose | What it does not do |
|---|---|---|
| ADC | Supplies a Google identity and OAuth scopes to Google Auth Library | Does not grant GA4 property or GTM account/container roles |
| Operator identity | Holds the existing GA4/GTM product permissions | Does not require a runtime Google Cloud project ID |
| MCP host | Starts the local stdio server | Does not acquire or store Google credentials for the server |
| Execution spec | Declares reviewed desired state and target resources | Never contains credentials or secret values |

The server does not read or require a Google Cloud project ID for GA4 Admin or GTM API calls. ADC supplies the identity; OAuth scopes authorize API capabilities; existing GA4/GTM product roles authorize access to the target resources.

## Setup order

1. Confirm the operator identity already has the required GA4 property and GTM account/container roles.
2. Follow [Google Cloud credentials](google-cloud-credentials.md) to choose an ADC source. For the supported custom-scope user-ADC path, create a Desktop OAuth client for gcloud acquisition only.
3. Run the canonical local flow and complete browser authorization while the login command remains active:

   ```bash
   npm install
   npm run login -- --client-id-file=/absolute/path/to/oauth-client.json
   npm run build
   ```

4. Configure the [MCP host](mcp-client-configuration.md) with absolute paths to Node and the built server. Leave its environment empty to use well-known local ADC, unless another standard ADC source is required.
5. Hand the server only reviewed execution-spec paths and target arguments as described in [application project integration](application-project-integration.md).

`npm run login` delegates to `gcloud auth application-default login --disable-quota-project`. It requests the complete runtime scope union plus gcloud's required `cloud-platform` scope, writes to gcloud's standard ADC location, and requires browser interaction. The Desktop OAuth client file is consumed by gcloud during acquisition only; the runtime server never reads it. Bare `npm run login` uses gcloud's built-in client and is best-effort for custom Analytics scopes. `cloud-platform` remains in the gcloud scope list because gcloud requires it for this custom-scope user-ADC flow; runtime mode scope arrays remain unchanged.

## Migration from removed OAuth-path variables

Delete `GOOGLE_OAUTH_CLIENT_SECRETS` and `GOOGLE_OAUTH_TOKEN_PATH` from existing MCP-host configuration, then restart the host after completing the ADC flow above. Do not replace them with a custom-client file path: `GOOGLE_APPLICATION_CREDENTIALS` is optional and accepts only a valid standard ADC credential file at an absolute path.

## Security boundary

Keep acquisition credentials and any alternate ADC files outside application repositories and version control. The execution spec declares reviewed desired state and target resources; it never contains credentials or secret values. `INCLUDE_PUBLISH_SCOPE=1` is a separately configured operation gate, not a scope-acquisition switch and not a bypass for the other publish guards.

## Focused guides

- [Google Cloud credentials](google-cloud-credentials.md): ADC source precedence and optional custom-client acquisition.
- [User OAuth login](user-oauth-login.md): browser authorization, gcloud warnings, recovery, and safe verification.
- [MCP client configuration](mcp-client-configuration.md): local stdio host configuration.
- [Application project integration](application-project-integration.md): reviewed handoff from an application repository.
