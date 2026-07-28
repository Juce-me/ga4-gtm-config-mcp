# Application project integration

The application repo owns analytics planning and instrumentation. This MCP repo executes a reviewed desired-state specification as the operator's Google user.

## Application repo responsibilities

Each application repo should maintain:

1. An analytics contract covering event names, `dataLayer` payloads, consent behavior, forbidden PII, and custom-dimension or metric intent.
2. Source-level instrumentation and practical tests for emitted payloads.
3. Reviewed `*.mcp-execution.yaml` specs with desired GA4/GTM state, target environment, and approval gates.
4. Private target mapping for the GA4 property and GTM account/container.

The application repo must not assume OAuth grants product permissions. Before execution, the operator's Google user must already have the intended access in the target GA4 property and GTM account/container.

## Keep credentials out of the application repo

Do not store:

- the downloaded OAuth Desktop client JSON;
- the generated refresh-token file;
- an OAuth client ID or secret;
- an access token or refresh token;
- a real operator email;
- real production IDs in public examples;
- machine-specific absolute paths in tracked configuration.

Keep the two credential files in private operator storage. Configure their absolute paths only in the local MCP host:

```text
GOOGLE_OAUTH_CLIENT_SECRETS=/absolute/path/to/private/google-oauth-client.json
GOOGLE_OAUTH_TOKEN_PATH=/absolute/path/to/private/google-oauth-token.json
```

## Execution handoff

1. The application repo produces or updates an `*.mcp-execution.yaml` spec.
2. A human reviews the spec and its gates.
3. The operator starts this MCP server with the private OAuth paths.
4. The server validates the spec, reads current state, and computes a deterministic diff.
5. Approved writes go to GA4 and a non-live GTM workspace.
6. Preview, container-version creation, and publish remain separate gated steps.

Target IDs belong in the reviewed spec and explicit tool arguments, not OAuth files or environment variables. Public docs should use placeholders such as `GA4_PROPERTY_ID`, `GTM_ACCOUNT_ID`, and `GTM_CONTAINER_ID`.
