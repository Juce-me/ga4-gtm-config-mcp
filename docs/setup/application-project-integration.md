# Application project integration

This file answers: **what should another application repo support when it needs GA4/GTM configuration through this MCP server?**

The application repo is the planning and instrumentation side. This MCP repo is the execution side.

## Application Repo Responsibilities

Each app repo should maintain:

1. An analytics contract:
   - event names
   - dataLayer payload shape
   - consent behavior
   - forbidden PII keys
   - custom dimension/metric intent
2. Source-level instrumentation:
   - where events fire
   - tests around emitted payloads where practical
   - no raw email, names, tokens, free text, full URLs with query strings, or secret-shaped values
3. Reviewed `*.mcp-execution.yaml` specs:
   - desired GA4 custom dimensions/metrics/key events
   - desired GTM variables/triggers/tags
   - target environment
   - approval gates
4. Private target mapping:
   - GA4 property ID
   - GTM account ID
   - GTM container ID
   - environment name

## Application Repo Must Not Store

Do not store this MCP server's:

- service-account JSON key
- WIF external-account credential file unless it is intentionally scoped to that repo's CI and kept in secret storage
- impersonated ADC / `application_default_credentials.json`; it includes nested human `source_credentials`
- OAuth Web client secret
- one-time OAuth access token
- refresh token
- real production IDs in public README examples

Use placeholders in public docs:

```text
PROJECT_ID
GA4_PROPERTY_ID
GTM_ACCOUNT_ID
GTM_CONTAINER_ID
SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com
```

## Handoff To This MCP Server

For a configuration change:

1. The app repo produces or updates an `*.mcp-execution.yaml` spec.
2. A human reviews the spec.
3. The operator runs this MCP server.
4. This MCP server validates the spec.
5. This MCP server reads current GA4/GTM state.
6. This MCP server computes a diff.
7. Approved writes go to a non-live GTM workspace and GA4 Admin API.
8. Preview, version creation, and publish remain separate gated steps.

## Recommended Private Operator Notes

Keep a private operator note outside public docs with:

```text
GA4 property: properties/GA4_PROPERTY_ID
GTM account: GTM_ACCOUNT_ID
GTM container: GTM_CONTAINER_ID
service account: SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com
credential path on this machine: <credential-json-path>
```

That note is operational configuration, not product documentation.
