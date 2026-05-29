Status: executed
Type: feature
Author: a.feygin

# GA4 Planner MCP Contract Fixes Implementation Plan

> **Status note (2026-05-29):** Implemented with changes. The MCP server now normalizes GTM/GA4 resource names, maps normalized desired state to Google API request bodies at the write boundary, resolves GTM trigger IDs before tag writes, strengthens semantic validation, revalidates dangerous gated tools, and documents the updated ID/scope behavior. Post-review fixes also closed full-resource live workspace bypasses, GTM publish path normalization, GA4 Admin bare-property normalization, GTM trigger-before-tag ordering, GA4 event tag API type mapping, and current-state round-trip normalization. The planner skill template was already corrected to remove the unsupported `Page Title` built-in and related guidance is aligned in the planner-skill repo.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make `ga4-gtm-config-mcp` safely execute the `*.mcp-execution.yaml` contract emitted by `google-analytics-implementation-planner`.

**Architecture:** Keep the planner skill as the owner of analytics decisions and human-readable desired state. Keep this MCP server as the execution layer by validating the handoff, normalizing resource names, mapping desired state to exact Google API payloads only at the write boundary, and re-running validation before every gated operation.

**Tech Stack:** TypeScript 5.9, Vitest, `googleapis` Tag Manager v2 and Analytics Admin v1beta, Zod, YAML.

---

## Audit Findings

1. **MCP P0: non-dry-run apply payloads are not API-shaped.**
   `toDesiredState()` emits normalized config (`parameter_name`, `display_name`, `tagType`, trigger names), but `applyPlan()` forwards `e.after` directly to GA4/GTM writers. Real writes therefore do not receive GA Admin camelCase payloads or GTM API bodies.

2. **MCP P0: GTM resource identifiers are ambiguous.**
   The example spec documents GTM target IDs as resource names (`accounts/...`, `accounts/.../containers/...`), while GTM wrappers build paths by prefixing bare IDs. Passing spec values directly would create malformed paths.

3. **Skill + MCP P1: `Page Title` is listed as a GTM built-in variable, but current Google docs list Page Hostname, Page Path, Page URL, and Referrer for page built-ins, not Page Title.**
   The planner template, MCP example, and fixtures should remove `Page Title`; the MCP validator should reject unknown built-ins instead of letting live apply fail.

4. **MCP P1: semantic validation is weaker than the planner contract.**
   `findPiiViolations()` exists, but `validateSpec()` does not use it for tag params. It also does not enforce the spec's `validation.forbidden_keys`, GA4 reserved prefixes/names, event/parameter length limits, or parameter-count limits.

5. **MCP P1: gated dangerous tools do not re-run semantic validation.**
   `create_gtm_container_version_gated` reads the spec and hardcodes `unresolved_validation_errors: 0`; `publish_gtm_version_gated` trusts a text report and never validates the current spec.

6. **MCP P1: Measurement Protocol secret metadata builds the wrong parent when `web_stream_id` is a full resource name.**
   The spec and example use `properties/.../dataStreams/...`; `listMetadata()` currently constructs `${propertyId}/dataStreams/${streamId}`.

7. **MCP P2: container-version auth scope is missing.**
   Google's `workspaces.create_version` method requires `tagmanager.edit.containerversions`; the current `write` scope only requests `tagmanager.edit.containers`.

## Files

Skill repo:
- Modify: `/Users/a.feygin/Documents/google-analytics-implementation-planner/skills/google-analytics-implementation-planner/assets/mcp-execution-spec-template.yaml`

MCP repo:
- Create: `src/gtm/idPaths.ts`
- Create: `src/ga4/resourceNames.ts`
- Create: `src/planner/apiPayloads.ts`
- Modify: `src/auth/googleAuth.ts`
- Modify: `src/auth/scopes.ts`
- Modify: `src/ga4/measurementProtocolSecrets.ts`
- Modify: `src/gtm/workspaces.ts`
- Modify: `src/gtm/builtInVariables.ts`
- Modify: `src/gtm/variables.ts`
- Modify: `src/gtm/triggers.ts`
- Modify: `src/gtm/tags.ts`
- Modify: `src/gtm/versions.ts`
- Modify: `src/tools/readTools.ts`
- Modify: `src/tools/diffTools.ts`
- Modify: `src/tools/applyTools.ts`
- Modify: `src/tools/versionTools.ts`
- Modify: `src/tools/publishTools.ts`
- Modify: `src/spec/validateSpec.ts`
- Modify: `examples/mcp-execution.example.yaml`
- Modify: `tests/fixtures/specs/*.yaml`
- Create: `tests/mcpExecutionContract.test.ts`
- Modify: `tests/gtmPayloads.test.ts`
- Modify: `tests/spec.validation.test.ts`
- Modify: `tests/ga4.measurementProtocolSecrets.test.ts`
- Modify: `README.md`

## Forbidden Regressions

- Do not add planning judgment to the MCP server. It must validate and apply only the approved spec.
- Do not make publish or version creation possible without the existing spec-level flag and per-call `approval_token`.
- Do not request publish scope outside publish mode.
- Do not log or return Measurement Protocol secret values.
- Do not accept the live/default GTM workspace (`workspaceId: "0"` or `"Default Workspace"`).
- Do not make writes default to live execution; every write tool continues to default to `dry_run: true`.

## Task 1: Add Contract Regression Tests

**Files:**
- Create: `tests/mcpExecutionContract.test.ts`
- Modify: `tests/gtmPayloads.test.ts`
- Modify: `tests/spec.validation.test.ts`
- Modify: `tests/ga4.measurementProtocolSecrets.test.ts`

- [x] **Step 1: Add a failing test that starts from the real fixture**

Create `tests/mcpExecutionContract.test.ts` with coverage that reads `tests/fixtures/specs/valid-web-dry-run.yaml`, converts it through `toDesiredState()` and `diffStates()`, then runs `applyPlan()` with `dryRun: false` and writer stubs that capture payloads.

Expected failures before implementation:
- GA4 custom dimension payload has `parameter_name` instead of `parameterName`.
- GTM variable payload has normalized `{ variableType, dlvName, dlvVersion }` instead of `{ name, type: "v", parameter: [...] }`.
- GTM built-in variable passes `"Page URL"` instead of the API enum `pageUrl`.
- GTM tag payload uses unresolved trigger names instead of trigger IDs.

- [x] **Step 2: Add validator tests for planner-contract guardrails**

Extend `tests/spec.validation.test.ts` with cases that expect `validateSpec()` to reject:
- `gtm_web.tags[].params.email`
- `gtm_web.tags[].params.page_location` with a full URL containing a query string
- `ga4_admin.custom_dimensions[].parameter_name` beginning with `ga_`, `google_`, `firebase_`, `gtag.`, or `_`
- `ga4_admin.custom_dimensions[].parameter_name` equal to `user_id`, `session_id`, `cid`, or `currency`
- `ga4_admin.key_events[].event_name` longer than 40 characters
- a normal GTM tag with more than 25 GA4 event parameters
- `gtm_web.built_in_variables` containing `"Page Title"`

- [x] **Step 3: Add Measurement Protocol parent tests**

Extend `tests/ga4.measurementProtocolSecrets.test.ts` to assert both inputs produce parent `properties/123/dataStreams/456`:
- `propertyId = "properties/123"`, `streamId = "456"`
- `propertyId = "properties/123"`, `streamId = "properties/123/dataStreams/456"`

- [x] **Step 4: Run the new tests and confirm they fail for the intended reasons**

Run:

```bash
npm test -- tests/mcpExecutionContract.test.ts tests/spec.validation.test.ts tests/ga4.measurementProtocolSecrets.test.ts
```

Expected: FAIL with assertions proving the current implementation does not enforce the contract.

## Task 2: Normalize Google Resource Names

**Files:**
- Create: `src/gtm/idPaths.ts`
- Create: `src/ga4/resourceNames.ts`
- Modify: `src/gtm/workspaces.ts`
- Modify: `src/gtm/builtInVariables.ts`
- Modify: `src/gtm/variables.ts`
- Modify: `src/gtm/triggers.ts`
- Modify: `src/gtm/tags.ts`
- Modify: `src/gtm/versions.ts`
- Modify: `src/tools/readTools.ts`
- Modify: `src/tools/diffTools.ts`
- Modify: `src/tools/applyTools.ts`
- Modify: `src/tools/versionTools.ts`
- Modify: `src/tools/publishTools.ts`
- Modify: `src/ga4/measurementProtocolSecrets.ts`

- [x] **Step 1: Add GTM ID/path helpers**

Implement helpers that accept either bare IDs or resource names:

```ts
export function gtmAccountId(value: string): string {
  return value.match(/^accounts\/([^/]+)$/)?.[1] ?? value;
}

export function gtmContainerId(value: string): string {
  return value.match(/^accounts\/[^/]+\/containers\/([^/]+)$/)?.[1] ?? value;
}

export function gtmContainerPath(account: string, container: string): string {
  return `accounts/${gtmAccountId(account)}/containers/${gtmContainerId(container)}`;
}

export function gtmWorkspacePath(account: string, container: string, workspace: string): string {
  const workspaceId = workspace.match(/^accounts\/[^/]+\/containers\/[^/]+\/workspaces\/([^/]+)$/)?.[1] ?? workspace;
  return `${gtmContainerPath(account, container)}/workspaces/${workspaceId}`;
}
```

- [x] **Step 2: Replace ad hoc GTM path interpolation**

Use `gtmContainerPath()` and `gtmWorkspacePath()` in every GTM wrapper and tool instead of manually building `accounts/${accountId}/containers/${containerId}`.

- [x] **Step 3: Add GA4 stream parent helper**

Implement:

```ts
export function dataStreamName(propertyId: string, streamIdOrName: string): string {
  if (/^properties\/[^/]+\/dataStreams\/[^/]+$/.test(streamIdOrName)) return streamIdOrName;
  return `${propertyId}/dataStreams/${streamIdOrName}`;
}
```

Use it in `listMetadata()`.

- [x] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/ga4.measurementProtocolSecrets.test.ts
```

Expected: PASS.

## Task 3: Convert Desired State To API Payloads At The Write Boundary

**Files:**
- Create: `src/planner/apiPayloads.ts`
- Modify: `src/planner/applyPlan.ts`
- Modify: `src/planner/desiredState.ts`
- Modify: `src/gtm/upsertResult.ts`
- Modify: `tests/mcpExecutionContract.test.ts`
- Modify: `tests/gtmPayloads.test.ts`

- [x] **Step 1: Move payload conversion out of `desiredState.ts`**

Create `src/planner/apiPayloads.ts` and move/expand the desired-to-Google payload helpers there. `desiredState.ts` should stay a pure desired-state normalizer.

- [x] **Step 2: Add GA4 payload mappers**

Map normalized GA4 config to Admin API request bodies:

```ts
export function ga4CustomDimensionPayload(config: Record<string, unknown>) {
  return {
    parameterName: String(config["parameter_name"]),
    displayName: String(config["display_name"]),
    scope: config["scope"] as "EVENT" | "USER" | "ITEM",
    ...(config["description"] !== undefined ? { description: String(config["description"]) } : {}),
  };
}
```

Implement equivalent mappers for custom metrics and key events.

- [x] **Step 3: Add built-in variable mapping**

Support current planner display names and API enum values:

```ts
const BUILT_IN_VARIABLE_TYPES: Record<string, string> = {
  "Page URL": "pageUrl",
  "Page Path": "pagePath",
  "Page Hostname": "pageHostname",
  "Referrer": "referrer",
  "Event": "event",
};
```

Reject unknown names in `validateSpec()` before live apply. Do not include `"Page Title"`.

- [x] **Step 4: Add GTM variable and trigger payload mappers**

Map DLV variables to `type: "v"` with `name` and `dataLayerVersion` parameters. Map custom event triggers so the `event_name` from the spec is represented in `customEventFilter` with `{{_event}}`, then append the spec's additional filters.

- [x] **Step 5: Add GTM tag payload mapper and trigger ID resolution**

Before writing tags, resolve `tag.config.trigger` from trigger display name to GTM trigger ID using current triggers plus any trigger IDs returned by writers during this apply call. Return `NAME_COLLISION` or `API_UNSUPPORTED` if a tag references a trigger that was neither present nor created.

- [x] **Step 6: Wire mappers into `applyPlan()`**

`applyPlan()` should pass API payloads to writers, not normalized config. Keep `diffStates()` output human-readable.

- [x] **Step 7: Run contract tests**

Run:

```bash
npm test -- tests/mcpExecutionContract.test.ts tests/gtmPayloads.test.ts tests/planner.applyPlan.test.ts
```

Expected: PASS, and captured writer payloads use Google API field names and resolved GTM trigger IDs.

## Task 4: Strengthen Semantic Validation

**Files:**
- Modify: `src/spec/validateSpec.ts`
- Modify: `src/safety/piiGuards.ts`
- Modify: `tests/spec.validation.test.ts`
- Modify: `tests/piiGuards.test.ts`

- [x] **Step 1: Reuse `findPiiViolations()` from `validateSpec()`**

Call it for every `gtm_web.tags[].params` object and convert findings to `ValidationFinding` entries with the source path under `gtm_web.tags[index].params`.

- [x] **Step 2: Enforce `validation.forbidden_keys`**

Merge the built-in forbidden key list with `validation.forbidden_keys.exact`, `.contains`, and `.patterns`. Apply it to tag parameter names, data-layer variable names, custom definition parameter names, and key event names.

- [x] **Step 3: Enforce GA4 name limits and reserved prefixes**

Reject event names over 40 characters, event parameter/custom definition names over 40 characters, custom definition names beginning with `_`, `firebase_`, `ga_`, `google_`, or `gtag.`, and reserved custom-definition parameter names such as `user_id`, `session_id`, `cid`, and `currency`.

- [x] **Step 4: Enforce GTM built-in allowlist**

Reject unknown `gtm_web.built_in_variables` names and include a message naming the allowed values.

- [x] **Step 5: Run validator tests**

Run:

```bash
npm test -- tests/spec.validation.test.ts tests/piiGuards.test.ts
```

Expected: PASS.

## Task 5: Re-Validate Before Dangerous Gates

**Files:**
- Modify: `src/tools/versionTools.ts`
- Modify: `src/tools/publishTools.ts`
- Modify: `src/safety/versionGuards.ts`
- Modify: `src/safety/publishGuards.ts`
- Modify: `tests/versionGuards.test.ts`
- Modify: `tests/publishGuards.test.ts`

- [x] **Step 1: Validate the spec in version and publish tools**

After `readSpec()`, call `validateSpec(spec)`. If `ok` is false, return an `MCPError` using the existing gated error code:
- `VERSION_CREATION_BLOCKED` for container-version creation
- `PUBLISH_BLOCKED` for publish

Include all validation findings in `details`.

- [x] **Step 2: Remove hardcoded clean validation assumptions**

Stop passing `unresolved_validation_errors: 0` unless it is derived from `validateSpec(spec)`.

- [x] **Step 3: Add tests that gated tools block invalid specs**

Use `tests/fixtures/specs/invalid-ua-fields.yaml` and an existing report path. The result must be blocked even with `approval_token` and spec flags set.

- [x] **Step 4: Run gate tests**

Run:

```bash
npm test -- tests/versionGuards.test.ts tests/publishGuards.test.ts
```

Expected: PASS.

## Task 6: Fix Version-Creation Scope Without Broadening Write Scope

**Files:**
- Modify: `src/auth/scopes.ts`
- Modify: `src/auth/googleAuth.ts`
- Modify: `src/gtm/tagManagerClient.ts`
- Modify: `src/tools/versionTools.ts`
- Modify: `README.md`
- Modify: `tests/auth.test.ts`

- [x] **Step 1: Add a dedicated version auth mode**

Add:

```ts
export const VERSION_SCOPES = [
  ...READ_SCOPES,
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
] as const;
```

Extend `AuthMode` with `"version"` and use `VERSION_SCOPES` only for version creation.

- [x] **Step 2: Keep ordinary writes least-privilege**

Do not add `tagmanager.edit.containerversions` to `WRITE_WORKSPACE_SCOPES`.

- [x] **Step 3: Update version tool**

Build the GTM client with `"version"` in `create_gtm_container_version_gated`.

- [x] **Step 4: Run auth tests**

Run:

```bash
npm test -- tests/auth.test.ts tests/gtm.versions.test.ts
```

Expected: PASS.

## Task 7: Fix Planner Skill Template And MCP Fixtures

**Files:**
- Modify: `/Users/a.feygin/Documents/google-analytics-implementation-planner/skills/google-analytics-implementation-planner/assets/mcp-execution-spec-template.yaml`
- Modify: `examples/mcp-execution.example.yaml`
- Modify: `tests/fixtures/specs/*.yaml`
- Modify: `README.md`

- [x] **Step 1: Remove unsupported `Page Title` built-in**

Delete this entry from the planner template, MCP example, and every fixture:

```yaml
    - "Page Title"
```

- [x] **Step 2: Add `Page Hostname` only if needed**

Do not add `Page Hostname` by default unless a plan actually needs hostname reporting. The minimal default built-ins should be:

```yaml
  built_in_variables:
    - "Page URL"
    - "Page Path"
    - "Referrer"
```

- [x] **Step 3: Document identifier formats**

Update `README.md` so tool arguments explicitly accept either bare GTM IDs or full resource names, and state that the MCP normalizes both before calling Google APIs.

- [x] **Step 4: Run fixture validation**

Run:

```bash
npm test -- tests/spec.schema.test.ts tests/spec.validation.test.ts tests/spec.read.test.ts
```

Expected: PASS.

## Final Verification

Run:

```bash
npm run typecheck
npm run build
npm test
```

Expected:
- Typecheck exits 0.
- Build exits 0.
- Full Vitest suite exits 0.
- No `console.log` is introduced under `src/`.
- `git status --short` contains only intentional source, test, docs, fixture, and skill-template changes.

Actual final run after post-review fixes:
- `npm run typecheck` exited 0.
- `npm run build` exited 0.
- `git diff --check` exited 0.
- `rg -n "console\\.log" src` returned no matches.
- `rg -n "Page Title" examples tests/fixtures src README.md` returned no matches.
- `npm test` exited 0: 36 test files, 151 tests.

Reviewer findings addressed:
- Full-resource live workspace IDs are rejected before GTM state reads and in version gates.
- GTM triggers are written before tags even when names sort the other way.
- GA4 Admin list/create parents normalize bare property IDs to `properties/<id>`.
- GTM publish normalizes full version resource names.
- Planner `ga4_event` maps to GTM API tag type `gaawe`, with event parameters represented as a GTM list/map parameter and normalized back to `ga4_event` when reading current state.
- Secret-shaped tag parameter keys are rejected even when `validation.forbidden_keys` is omitted.

## Outcome

Implemented with post-review fixes. The implementation is now the source of truth.

The task split was executed with subagents for resource/path normalization, API payload conversion, and semantic validation/template alignment. A reviewer subagent then found remaining contract gaps; the controller added focused regressions, patched the gaps, and reran full verification.

## Current Accuracy

Accurate with post-review additions: the findings, target behavior, and verification strategy match the result. The implementation added current-state GTM API-to-planner normalization and full-resource safety regressions beyond the initial plan because the review showed they were required for reliable final verification against the approved configuration contract.
