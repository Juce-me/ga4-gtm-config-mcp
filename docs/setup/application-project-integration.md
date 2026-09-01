# Application project integration

The application repository defines analytics behavior and reviewed desired state. This server executes that state using separately configured ADC; application-project configuration does not select runtime Google credentials.

| Item | Purpose | What it does not do |
|---|---|---|
| ADC | Supplies a Google identity and OAuth scopes to Google Auth Library | Does not grant GA4 property or GTM account/container roles |
| Operator identity | Holds the existing GA4/GTM product permissions | Does not require a runtime Google Cloud project ID |
| MCP host | Starts the local stdio server | Does not acquire or store Google credentials for the server |
| Execution spec | Declares reviewed desired state and target resources | Never contains credentials or secret values |

## Application repository responsibilities

An application repository should maintain:

1. The analytics contract, including event names, `dataLayer` payloads, consent behavior, forbidden PII, and custom-dimension or metric intent.
2. Source-level instrumentation and practical tests for emitted payloads.
3. Reviewed `*.mcp-execution.yaml` specs declaring desired GA4/GTM state, targets, and approval gates.

The application repository passes only reviewed spec paths and explicit target arguments to MCP tools. Target IDs belong in those reviewed inputs, not in credentials or tracked host configuration.

## Keep credentials outside application repositories

Do not store an OAuth client JSON, an alternate ADC credential file, service-account key, access token, refresh token, operator email, or machine-specific private path in an application repository. Keep every credential source in private operator or managed-runtime storage.

The MCP host, not the application repository, selects an optional alternate standard ADC source through `GOOGLE_APPLICATION_CREDENTIALS` with an absolute private path. Leaving it unset uses the well-known ADC source. An OAuth client JSON is acquisition-only input for gcloud and is never a runtime server credential.

## Execution handoff

1. Produce or update a reviewed `*.mcp-execution.yaml` execution spec.
2. Review the desired state, target resources, environment, and safety gates.
3. Start the MCP host using the separate ADC configuration described in [MCP client configuration](mcp-client-configuration.md).
4. Invoke tools with the reviewed spec path and required target arguments.
5. Let the server validate the spec, read current state, calculate a deterministic diff, and apply approved writes only to a non-live GTM workspace.
6. Treat preview, container-version creation, and publish as separate gated actions.

ADC supplies an identity and OAuth scopes, while the operator identity must already hold the required GA4/GTM product roles. The execution spec never contains credentials or secret values.
