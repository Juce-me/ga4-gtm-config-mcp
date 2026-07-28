Status: executed
Type: feature
Author: minired-panda

# Build the ga4-gtm-config-mcp Server — Implementation Plan

> **Status note (2026-05-28):** ALL milestones M0–M8 have shipped on branch `feat/m0-m3-validator-slice`. Slices 1–5 (M0–M7) are recorded in the §Slice outcome sections near the end of this file; M8 (examples, `.env.example`, README, this rename + outcome, AGENTS.md §10 refresh) is recorded in the §Outcome and §Current Accuracy sections at the very end. Final verification: `npm run typecheck`, `npm run build`, and `npm test` (123/123) all green; the built server boots with 12 tools. This artifact is now historical — shipped code, tests, and `README.md` are the source of truth.

> **Supersession note (2026-07-28):** Authentication and setup portions that describe workload credentials were later replaced by local user OAuth; current code, `README.md`, and `docs/setup/` are authoritative.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a TypeScript MCP server that consumes an approved `*.mcp-execution.yaml` spec from `google-analytics-implementation-planner`, reads current GA4/GTM state, produces a deterministic diff, applies approved changes safely into a non-live GTM workspace, and hard-blocks both container-version creation and publishing unless explicitly approved.

**Architecture:** Stdio MCP server (`@modelcontextprotocol/sdk` v1.x stable) with typed Zod input schemas, the official `googleapis` SDK for GA4 Admin and GTM v2, and a layered design: `spec → validate → readState → diff → apply → version → publish`. Every write tool defaults to `dry_run: true`. Every dangerous tool requires an `approval_token` plus a spec-level boolean flag. Tool descriptions are explicitly read/write/gated. No raw API mutation tools are exposed.

**Tech Stack:**
- Node.js >= 20 LTS, TypeScript 5.x (pin exact)
- `@modelcontextprotocol/sdk` (pin v1.29.0)
- `googleapis` (pin v172.x) — only installed in M4
- `zod` v4 (pin), `yaml` v2 (pin), `vitest` v3 (pin)

---

## Scope of THIS pass — M0 → M3 only

This pass ships:

- **M0** project foundation
- **M1** core utilities
- **M2** spec read / zod schema / semantic validator / summarizer
- **M3** all nine safety guards as pure functions and unit-tested
- **M3 wrap-up task (3.10)** wires three working MCP tools (`read_mcp_execution_spec`, `validate_mcp_execution_spec`, `summarize_mcp_execution_spec`) into `server.ts`, replacing the M0 `ping` placeholder. The other eight tools listed in M7 are **not registered** this pass.

What this pass does **not** ship:

- **M4** Google API clients — `googleapis` is not added to `package.json` yet.
- **M5** diff engine — covered only by an empty `planner/` placeholder directory? No: the directory is not created until M5.
- **M6** apply orchestrator + GTM/GA4 writers.
- **M7** the remaining eight tools (`read_ga4_state`, `read_gtm_state`, `diff_ga4_gtm_state`, `create_gtm_workspace`, `apply_gtm_workspace_changes`, `apply_ga4_admin_changes`, `get_gtm_preview_info`, `create_gtm_container_version_gated`, `publish_gtm_version_gated`).
- **M8** `examples/mcp-execution.example.yaml`, `.env.example`, full README rewrite.

These milestones stay in this plan for the follow-up pass. The acceptance criteria at the bottom of this plan are the **full-server** criteria; THIS pass's acceptance is recorded under §M0–M3 acceptance below.

### M0–M3 acceptance (this pass)

- `npm install` succeeds; `googleapis` is **not** in the dependency tree.
- `npm run typecheck` passes.
- `npm test` passes; every safety guard from M3 has at least one passing test.
- `npm run build` produces `dist/server.js`.
- `node dist/server.js` boots and exposes exactly three tools: `read_mcp_execution_spec`, `validate_mcp_execution_spec`, `summarize_mcp_execution_spec`. Tool descriptions start with `[read-only]` and pass `assertSafeToolMetadata`.
- Running `validate_mcp_execution_spec` on the `valid-web-dry-run.yaml` fixture returns `ok: true, errors: []`.
- Running it on each of the five invalid fixtures returns the expected error code.

---

## Scope Boundary (reminder before any task)

This MCP server does **not**:

- Invent analytics strategy, events, custom dimensions, key events, consent behavior, or GTM architecture.
- Read or write Markdown plan tables as a source of truth — only the `*.mcp-execution.yaml` spec is authoritative.
- Expose raw API mutation tools (`create_tag(raw_json)`, `run_google_api_method`, etc.).
- Modify the live/default GTM workspace.
- Publish, create container versions, modify consent settings, or perform destructive changes by default — every one of these is hard-gated.
- Store, log, echo, or write secret values (OAuth tokens, refresh tokens, MP secrets, client secrets) anywhere — including audit logs and tool output.

If a task tempts you to do any of the above, stop and re-read this section.

---

## File Structure

All paths are relative to repo root `/Users/juce/Documents/devs/ga4-gtm-config-mcp`.

### Top-level

| File                 | Responsibility |
|----------------------|----------------|
| `package.json`       | Pinned deps, `mcp` start script, `build`, `test`, `typecheck` scripts. ESM module type. |
| `package-lock.json`  | Lockfile (committed). |
| `tsconfig.json`      | NodeNext module/resolution, strict mode, ES2022 target, `outDir: dist`. |
| `vitest.config.ts`   | Node env, `tests/**/*.test.ts` includes. |
| `.gitignore`         | `node_modules`, `dist`, `.env`, `*.log`, `coverage`. |
| `.env.example`       | Documented Google auth env vars with placeholder values only. |
| `README.md`          | Full user-facing docs (overwrite the current scaffolding stub). |

### `src/`

| File | Responsibility |
|------|----------------|
| `server.ts` | MCP server bootstrap; registers all 12 tools; connects stdio transport. |
| `auth/scopes.ts` | Constants for read / edit / publish scope arrays. |
| `auth/googleAuth.ts` | Build a `GoogleAuth` from env (service account file *or* OAuth refresh token); attaches scoped client. |
| `spec/mcpExecutionSpec.schema.ts` | Zod schema for the entire spec; mirrors `examples/mcp-execution-spec-template.yaml`. |
| `spec/readSpec.ts` | Load YAML from disk, parse, return raw object. |
| `spec/validateSpec.ts` | Apply Zod schema + cross-field semantic checks (UA fields, secrets, high-card dims, per-event-tag detection, consent guard, ecommerce/sGTM gate). Returns `{ ok, warnings, errors }`. |
| `ga4/adminClient.ts` | Factory returning the `google.analyticsadmin('v1beta')` client, plus a capability detector. |
| `ga4/capabilities.ts` | Static map of which GA Admin operations are supported / alpha / unsupported. |
| `ga4/properties.ts` | `readProperty(propertyId)`. |
| `ga4/streams.ts` | `listDataStreams(propertyId)`. |
| `ga4/customDimensions.ts` | `list`, `create`, `update` for GA4 CDs. |
| `ga4/customMetrics.ts` | `list`, `create`, `update` for GA4 CMs. |
| `ga4/keyEvents.ts` | `list`, `create`, `update` for GA4 key events. |
| `ga4/measurementProtocolSecrets.ts` | `listMetadata` only — returns names + display names, never the secret value. `createPlaceholder` is implemented but never echoes the secret back into output beyond a one-time "stored externally" reminder. |
| `gtm/tagManagerClient.ts` | Factory returning the `google.tagmanager('v2')` client. |
| `gtm/accounts.ts` | `listAccounts`, `getAccount`. |
| `gtm/containers.ts` | `listContainers`, `getContainer`. |
| `gtm/workspaces.ts` | `listWorkspaces`, `createWorkspace`, `findByName`, capacity check via list. |
| `gtm/builtInVariables.ts` | `list`, `create` for built-in vars in a workspace. |
| `gtm/variables.ts` | `list`, `create`, `update` for user-defined variables (DLV). |
| `gtm/triggers.ts` | `list`, `create`, `update` for triggers. |
| `gtm/tags.ts` | `list`, `create`, `update` for tags. |
| `gtm/versions.ts` | `createVersion` — **never call from dry-run paths**; only via `create_gtm_container_version_gated`. |
| `gtm/preview.ts` | Returns workspace/version preview metadata and manual checklist. Does **not** create versions. |
| `gtm/publish.ts` | `publishVersion` — only callable via `publish_gtm_version_gated`. |
| `planner/desiredState.ts` | Normalize spec → internal `DesiredState` plain object. |
| `planner/currentState.ts` | Normalize Google API responses → internal `CurrentState` plain object. |
| `planner/diff.ts` | Pure function `(desired, current) → { creates, updates, unchanged, skipped, blocked, warnings }`; deterministic ordering. |
| `planner/applyPlan.ts` | Iterate diff and call the appropriate writers, threading dry-run + safety gates. |
| `safety/approvalGate.ts` | `requireApprovalToken({ action, spec, args }) → ok \| BlockedError`. |
| `safety/destructiveChangeGuards.ts` | Detects deletes/archives/tag overwrites; defaults to block. |
| `safety/piiGuards.ts` | Forbidden keys + high-card dims + full-URL detection. |
| `safety/publishGuards.ts` | Final pre-publish checks (spec flag, approval token, validation report, env match). |
| `safety/workspaceGuards.ts` | Capacity check, live-workspace rejection, name-collision detection. |
| `safety/versionGuards.ts` | Same shape as publishGuards but for container version creation. |
| `safety/consentGuards.ts` | Block any change to consent tags / initialization / settings unless explicitly approved. |
| `safety/auditLog.ts` | Append structured JSON lines to `.audit/audit-YYYY-MM-DD.log`; redacts via `utils/redact.ts`. |
| `safety/toolMetadataGuards.ts` | Pure check that every registered tool's name/description passes static rules. Runs at server boot AND as a unit test. |
| `tools/readTools.ts` | `read_mcp_execution_spec`, `read_ga4_state`, `read_gtm_state`. |
| `tools/validateTools.ts` | `validate_mcp_execution_spec`, `summarize_mcp_execution_spec`. |
| `tools/diffTools.ts` | `diff_ga4_gtm_state`. |
| `tools/applyTools.ts` | `create_gtm_workspace`, `apply_gtm_workspace_changes`, `apply_ga4_admin_changes`. |
| `tools/previewTools.ts` | `get_gtm_preview_info`. |
| `tools/versionTools.ts` | `create_gtm_container_version_gated`. |
| `tools/publishTools.ts` | `publish_gtm_version_gated`. |
| `utils/logger.ts` | `info`, `warn`, `error` writing to stderr (stdout is reserved for MCP). |
| `utils/errors.ts` | `MCPError` class with machine-readable `code` + `details`; the 12 codes from §Error Codes. |
| `utils/names.ts` | Date-suffix workspace names; deterministic entity naming helpers. |
| `utils/stableJson.ts` | Deterministic stringify (recursive key sort) used by diffs and audit log. |
| `utils/redact.ts` | Replace any value matching `oauth|token|secret|password|refresh_token|api_key` keys with `[REDACTED]`. |

### `examples/`

| File | Responsibility |
|------|----------------|
| `mcp-execution.example.yaml` | A complete valid web-only spec (copy of the planner template with realistic placeholders). |
| `.env.example` | Documented env vars, placeholder values only. |

### `tests/`

| File | What it covers |
|------|----------------|
| `tests/spec.validation.test.ts` | Schema acceptance for valid spec; rejection for UA fields, high-card dims, per-event tags, secrets, consent change, missing target IDs (when not dry-run). |
| `tests/piiGuards.test.ts` | All forbidden keys + URL-with-query-string detection + Referrer-built-in-variable allowed but raw referrer param rejected. |
| `tests/diff.test.ts` | Stable ordering + creates/updates/unchanged/skipped classification + no-write guarantee in dry-run. |
| `tests/gtmPayloads.test.ts` | Desired-state → GTM API payload shape for variables / triggers / tags. |
| `tests/workspaceGuards.test.ts` | Capacity blocked, live workspace rejected, name collision detected. |
| `tests/versionGuards.test.ts` | Hard-block without spec flag, approval token, or diff report. |
| `tests/publishGuards.test.ts` | Hard-block without spec flag, approval token, validation report, env match, preview. |
| `tests/toolMetadataGuards.test.ts` | Every registered tool has explicit `read|dry-run|write|gated|dangerous` label and no instructional language; dangerous tools require `approval_token`. |
| `tests/fixtures/specs/*.yaml` | The 8 fixture specs listed under §Fixtures. |

### `docs/agents/features/`

This plan file lives here. On completion it is renamed `EXECUTED-2026-05-28-build-mcp-server.md` with an `Outcome` and `Current Accuracy` section.

---

## Error Codes (`utils/errors.ts`)

`MCPError.code` is one of the following string literals. Every tool that surfaces a failure returns a `MCPError` (never throws raw `Error`).

| Code | When used |
|------|-----------|
| `SPEC_INVALID` | Zod or semantic validation failed. |
| `MISSING_TARGET_ID` | Spec missing required `ga4_property_id` / `gtm_*` and not in placeholder-only mode. |
| `SECRET_DETECTED` | A field looks like a credential/secret. |
| `PII_DETECTED` | A field matches the PII guard. |
| `WORKSPACE_CAPACITY_BLOCKED` | GTM container has no free workspace slot (3-workspace limit). |
| `WORKSPACE_UNSAFE` | Targeting live/default workspace, or workspace mismatches spec. |
| `VERSION_CREATION_BLOCKED` | `create_gtm_container_version_gated` pre-conditions not met. |
| `PUBLISH_BLOCKED` | `publish_gtm_version_gated` pre-conditions not met. |
| `API_UNSUPPORTED` | Google API capability is alpha-only / unavailable. |
| `PERMISSION_DENIED` | API returned 403 / scope missing. |
| `NAME_COLLISION` | Existing GTM entity with same name but differing config. |
| `CONSENT_CHANGE_BLOCKED` | Spec or apply would modify consent and is not explicitly approved. |

---

## Audit Log Format (`safety/auditLog.ts`)

One JSON line per event, written to `.audit/audit-<UTC-date>.log`:

```json
{"ts":"2026-05-28T10:11:12.345Z","event":"spec_loaded","spec_path":"docs/...yaml","spec_version":1,"mode":"dry_run"}
{"ts":"...","event":"workspace_capacity_checked","account_id":"...","container_id":"...","free_slots":2}
{"ts":"...","event":"gtm_apply_summary","workspace_id":"...","creates":3,"updates":1,"skipped":0,"blocked":0}
{"ts":"...","event":"publish_blocked","reason":"approval_token_missing","container_id":"..."}
```

Required events: `spec_loaded`, `validation_passed`, `validation_failed`, `diff_generated`, `workspace_capacity_checked`, `workspace_created`, `workspace_reused`, `workspace_blocked`, `gtm_apply_summary`, `ga4_apply_summary`, `version_created`, `version_blocked`, `publish_blocked`, `publish_succeeded`.

**Forbidden in audit log:** secret values, MP secret values, OAuth tokens, refresh tokens, event payload values, raw API responses. All output is filtered through `utils/redact.ts`.

---

## Fixtures (`tests/fixtures/specs/`)

| File | Shape | Expected validator result |
|------|-------|---------------------------|
| `valid-web-dry-run.yaml` | Full valid web spec, `mode: dry_run`, all gates `false`. | `ok` |
| `invalid-ua-fields.yaml` | Includes `event_category`, `event_action`. | `SPEC_INVALID` |
| `invalid-secret-in-spec.yaml` | A field value matches `oauth|token|secret`. | `SECRET_DETECTED` |
| `invalid-high-card-cd.yaml` | Defines `user_id` as a custom dimension. | `PII_DETECTED` |
| `invalid-per-event-tag.yaml` | One GA4 tag per product event. | `SPEC_INVALID` |
| `invalid-publish-requested.yaml` | `publish_allowed: true` without approval. | `PUBLISH_BLOCKED` (tested inline in `tests/publishGuards.test.ts` — no YAML fixture; gate input is a synthetic object, not a parsed spec) |
| `invalid-version-requested.yaml` | `create_container_version_allowed: true` without approval. | `VERSION_CREATION_BLOCKED` (tested inline in `tests/versionGuards.test.ts` — no YAML fixture; gate input is a synthetic object, not a parsed spec) |
| `invalid-consent-change.yaml` | Modifies consent tag config without approval. | `CONSENT_CHANGE_BLOCKED` |

---

# Milestones

Each milestone ends with `npm test && npm run build && npm run typecheck` all green. Commit at the end of each task. Before the next milestone, the executing agent must pause and show test output to the user.

---

## Milestone 0 — Project Foundation

### Task 0.1: Initialize package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write `.gitignore` additions**

Append to `.gitignore` (keep existing `.DS_Store` lines):

```gitignore
node_modules/
dist/
coverage/
.env
*.log
.audit/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "ga4-gtm-config-mcp",
  "version": "0.1.0",
  "description": "Safe GA4/GTM configuration MCP server. Consumes approved mcp-execution.yaml specs from google-analytics-implementation-planner.",
  "type": "module",
  "private": true,
  "bin": {
    "ga4-gtm-config-mcp": "dist/server.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "mcp": "node dist/server.js",
    "dev": "tsc -p tsconfig.json && node dist/server.js"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.29.0",
    "yaml": "2.9.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "25.9.1",
    "typescript": "5.9.3",
    "vitest": "3.2.4"
  }
}
```

(Pin TypeScript to a 5.x line for stability rather than tracking 6.x which only just released.)

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 5: Install + verify**

Run: `npm install`
Expected: lockfile generated, no errors.

Run: `npm run typecheck`
Expected: TS finds no source files yet → either passes silently or trivially. If TS errors on "no inputs", create `src/.gitkeep` is **forbidden** by convention — instead create the first real source file in the next task.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold TypeScript project with pinned MCP/googleapis deps"
```

---

### Task 0.2: Smoke server skeleton (verifies SDK imports work)

**Files:**
- Create: `src/server.ts`
- Create: `tests/server.boot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server.boot.test.ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";

describe("server bootstrap", () => {
  it("constructs an MCP server with name and version", () => {
    const { server } = buildServer();
    expect(server).toBeDefined();
  });

  it("registers at least one tool", () => {
    const { toolNames } = buildServer();
    expect(toolNames.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test`
Expected: FAIL — `src/server.ts` does not exist.

- [ ] **Step 3: Minimal implementation**

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export function buildServer() {
  const server = new McpServer({
    name: "ga4-gtm-config-mcp",
    version: "0.1.0",
  });

  const toolNames: string[] = [];

  server.registerTool(
    "ping",
    {
      description: "[read-only] Returns pong. Placeholder used during scaffolding; remove once real tools land.",
      inputSchema: { },
    },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  );
  toolNames.push("ping");

  return { server, toolNames };
}

async function main() {
  const { server } = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

- [ ] **Step 4: Run test + build**

Run: `npm test && npm run build`
Expected: PASS, `dist/server.js` exists.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/server.boot.test.ts
git commit -m "feat: stdio MCP server skeleton with placeholder ping tool"
```

---

## Milestone 1 — Core Utilities

### Task 1.1: `utils/errors.ts`

**Files:**
- Create: `src/utils/errors.ts`
- Create: `tests/utils/errors.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { MCPError, ErrorCode } from "../../src/utils/errors.js";

describe("MCPError", () => {
  it("carries machine-readable code", () => {
    const e = new MCPError("SPEC_INVALID", "bad schema", { field: "execution.mode" });
    expect(e.code).toBe("SPEC_INVALID");
    expect(e.message).toBe("bad schema");
    expect(e.details).toEqual({ field: "execution.mode" });
  });

  it("serializes to JSON shape consumers can return", () => {
    const e = new MCPError("PUBLISH_BLOCKED", "no approval token");
    expect(e.toJSON()).toEqual({
      error: { code: "PUBLISH_BLOCKED", message: "no approval token", details: {} },
    });
  });

  it("enumerates all 12 error codes", () => {
    const expected = [
      "SPEC_INVALID","MISSING_TARGET_ID","SECRET_DETECTED","PII_DETECTED",
      "WORKSPACE_CAPACITY_BLOCKED","WORKSPACE_UNSAFE","VERSION_CREATION_BLOCKED",
      "PUBLISH_BLOCKED","API_UNSUPPORTED","PERMISSION_DENIED","NAME_COLLISION",
      "CONSENT_CHANGE_BLOCKED"
    ] satisfies ErrorCode[];
    expect(expected.length).toBe(12);
  });
});
```

- [ ] **Step 2: Run, see fail.**

Run: `npm test -- errors`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/utils/errors.ts
export const ERROR_CODES = [
  "SPEC_INVALID",
  "MISSING_TARGET_ID",
  "SECRET_DETECTED",
  "PII_DETECTED",
  "WORKSPACE_CAPACITY_BLOCKED",
  "WORKSPACE_UNSAFE",
  "VERSION_CREATION_BLOCKED",
  "PUBLISH_BLOCKED",
  "API_UNSUPPORTED",
  "PERMISSION_DENIED",
  "NAME_COLLISION",
  "CONSENT_CHANGE_BLOCKED",
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

export class MCPError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "MCPError";
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
```

- [ ] **Step 4: Run, pass.** `npm test -- errors` → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(utils): MCPError with the 12 machine-readable codes"`

---

### Task 1.2: `utils/redact.ts`

**Files:**
- Create: `src/utils/redact.ts`
- Create: `tests/utils/redact.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { redact } from "../../src/utils/redact.js";

describe("redact", () => {
  it("redacts known secret-shaped keys (case-insensitive, nested)", () => {
    const input = { name: "ok", oauth_token: "abc", nested: { client_secret: "xyz", safe: 1 } };
    expect(redact(input)).toEqual({
      name: "ok",
      oauth_token: "[REDACTED]",
      nested: { client_secret: "[REDACTED]", safe: 1 },
    });
  });

  it("never mutates the input", () => {
    const input = { secret: "x" };
    redact(input);
    expect(input.secret).toBe("x");
  });

  it("walks arrays", () => {
    expect(redact([{ password: "p" }])).toEqual([{ password: "[REDACTED]" }]);
  });
});
```

- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement**

```ts
// src/utils/redact.ts
const SECRET_KEY_RE = /(token|secret|password|refresh_token|api[_-]?key|oauth|client_secret|authorization)/i;

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[REDACTED]" : redact(v);
    }
    return out as unknown as T;
  }
  return value;
}
```

- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(utils): redact for secret-shaped object keys"`

---

### Task 1.3: `utils/stableJson.ts`

**Files:**
- Create: `src/utils/stableJson.ts`
- Create: `tests/utils/stableJson.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { stableStringify } from "../../src/utils/stableJson.js";

describe("stableStringify", () => {
  it("sorts object keys recursively", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("two equivalent objects produce identical strings", () => {
    expect(stableStringify({ x: 1, y: 2 })).toBe(stableStringify({ y: 2, x: 1 }));
  });
});
```

- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement**

```ts
// src/utils/stableJson.ts
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}
```

- [ ] **Step 4: Pass, commit.** `git commit -am "feat(utils): stableStringify for deterministic diff/audit output"`

---

### Task 1.4: `utils/logger.ts` and `utils/names.ts`

**Files:**
- Create: `src/utils/logger.ts`
- Create: `src/utils/names.ts`
- Create: `tests/utils/names.test.ts`

- [ ] **Step 1: Test `names.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { datedWorkspaceName, slugifyEntityName } from "../../src/utils/names.js";

describe("names", () => {
  it("datedWorkspaceName uses UTC YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T10:00:00Z"));
    expect(datedWorkspaceName("ga4-instrumentation")).toBe("ga4-instrumentation-2026-05-28");
    vi.useRealTimers();
  });

  it("slugifyEntityName preserves human-readable shape", () => {
    expect(slugifyEntityName("DLV - eventParams.foo")).toBe("DLV - eventParams.foo");
  });
});
```

- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement both**

```ts
// src/utils/logger.ts — stderr only (stdout reserved for MCP transport)
export const logger = {
  info: (msg: string, extra: Record<string, unknown> = {}) =>
    process.stderr.write(JSON.stringify({ level: "info", msg, ...extra }) + "\n"),
  warn: (msg: string, extra: Record<string, unknown> = {}) =>
    process.stderr.write(JSON.stringify({ level: "warn", msg, ...extra }) + "\n"),
  error: (msg: string, extra: Record<string, unknown> = {}) =>
    process.stderr.write(JSON.stringify({ level: "error", msg, ...extra }) + "\n"),
};
```

```ts
// src/utils/names.ts
export function datedWorkspaceName(base: string, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${base}-${y}-${m}-${d}`;
}

export function slugifyEntityName(name: string): string {
  return name.trim();
}
```

- [ ] **Step 4: Pass, commit.** `git commit -am "feat(utils): logger (stderr-only) and entity naming helpers"`

---

## Milestone 2 — Spec Schema, Read, Validate

### Task 2.1: Zod schema for `mcp-execution.yaml`

**Files:**
- Create: `src/spec/mcpExecutionSpec.schema.ts`
- Create: `tests/fixtures/specs/valid-web-dry-run.yaml`
- Create: `tests/spec.schema.test.ts`

- [ ] **Step 1: Save the spec template as a fixture**

Copy the planner template at `/Users/juce/Documents/devs/google-analytics-skill/skills/google-analytics-implementation-planner/assets/mcp-execution-spec-template.yaml` into `tests/fixtures/specs/valid-web-dry-run.yaml` and replace `<...>` placeholder values with concrete demo values (e.g. `properties/123456789`, `G-ABCDEFG`, `accounts/12345`, etc.). Set `target.environment: "dev"`. Keep all gates `false`.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { McpExecutionSpec } from "../src/spec/mcpExecutionSpec.schema.js";

describe("McpExecutionSpec zod schema", () => {
  it("accepts the valid-web-dry-run fixture", () => {
    const raw = parse(readFileSync("tests/fixtures/specs/valid-web-dry-run.yaml", "utf8"));
    const parsed = McpExecutionSpec.safeParse(raw);
    if (!parsed.success) console.error(parsed.error.format());
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown top-level keys", () => {
    const raw = { status: "planned", type: "ga4_gtm_mcp_execution_spec", version: 1, bogus: true };
    expect(McpExecutionSpec.safeParse(raw).success).toBe(false);
  });

  it("requires execution.publish_allowed and create_container_version_allowed to default to false", () => {
    const minimal = {
      status: "planned",
      type: "ga4_gtm_mcp_execution_spec",
      version: 1,
      target: { environment: "dev" },
      execution: { mode: "dry_run", workspace_name: "ws-2026-01-01" },
      ga4_admin: {},
      gtm_web: { enabled: true },
    };
    const parsed = McpExecutionSpec.parse(minimal);
    expect(parsed.execution.publish_allowed).toBe(false);
    expect(parsed.execution.create_container_version_allowed).toBe(false);
    expect(parsed.execution.destructive_changes_allowed).toBe(false);
  });
});
```

- [ ] **Step 3: Run, fail.**

- [ ] **Step 4: Implement the schema**

```ts
// src/spec/mcpExecutionSpec.schema.ts
import { z } from "zod";

const Target = z.object({
  environment: z.enum(["dev", "staging", "prod"]),
  ga4_property_id: z.string().optional(),
  web_stream_id: z.string().optional(),
  measurement_id: z.string().optional(),
  gtm_account_id: z.string().optional(),
  gtm_web_container_id: z.string().optional(),
  gtm_server_container_id: z.string().optional(),
}).strict();

const SourceArtifacts = z.object({
  design_plan: z.string().optional(),
  setup_runbook: z.string().optional(),
  analytics_contract: z.string().optional(),
}).strict().optional();

const Execution = z.object({
  mode: z.enum(["dry_run", "apply_workspace"]),
  workspace_name: z.string(),
  publish_allowed: z.boolean().default(false),
  require_human_approval: z.boolean().default(true),
  approval_token_required: z.boolean().default(true),
  destructive_changes_allowed: z.boolean().default(false),
  create_container_version_allowed: z.boolean().default(false),
  note: z.string().optional(),
}).strict();

const Preflight = z.object({
  required: z.array(z.string()),
}).strict().optional();

const CustomDimension = z.object({
  display_name: z.string(),
  parameter_name: z.string(),
  scope: z.enum(["EVENT", "USER", "ITEM"]),
  description: z.string().optional(),
  decision: z.string().optional(),
  source_catalog_row: z.string().optional(),
}).strict();

const CustomMetric = z.object({
  display_name: z.string(),
  parameter_name: z.string(),
  scope: z.enum(["EVENT"]),
  unit: z.enum(["STANDARD", "CURRENCY", "FEET", "METERS", "KILOMETERS", "MILES",
                "MILLISECONDS", "SECONDS", "MINUTES", "HOURS"]),
  description: z.string().optional(),
  decision: z.string().optional(),
  source_catalog_row: z.string().optional(),
}).strict();

const KeyEvent = z.object({
  event_name: z.string(),
  decision: z.string().optional(),
}).strict();

const MeasurementProtocol = z.object({
  enabled: z.boolean().default(false),
  api_secret: z.object({
    action: z.enum(["manual_create", "mcp_create_placeholder"]),
    secret_value: z.literal("NEVER_STORE_SECRET_IN_SPEC"),
    handling_note: z.string().optional(),
  }).strict().optional(),
}).strict().optional();

const GA4Admin = z.object({
  custom_dimensions: z.array(CustomDimension).default([]),
  custom_metrics: z.array(CustomMetric).default([]),
  key_events: z.array(KeyEvent).default([]),
  measurement_protocol: MeasurementProtocol,
}).strict();

const DLV = z.object({
  name: z.string(),
  data_layer_variable_name: z.string(),
  version: z.literal(1).or(z.literal(2)).default(2),
  purpose: z.string().optional(),
}).strict();

const TriggerFilter = z.object({
  variable: z.string(),
  operator: z.enum(["equals", "contains", "starts_with", "ends_with", "matches_regex"]),
  value: z.string(),
}).strict();

const Trigger = z.object({
  name: z.string(),
  type: z.enum(["custom_event", "page_view", "history_change"]),
  event_name: z.string().optional(),
  filters: z.array(TriggerFilter).default([]),
}).strict();

// Tag.type is kept as a free string at the schema level so that disallowed
// types (e.g. "consent_initialization", any UA-era tag type) parse successfully
// and are then caught by the semantic validator with the right error code,
// instead of failing at schema level with a generic SPEC_INVALID.
const Tag = z.object({
  name: z.string(),
  type: z.string(),
  measurement_id: z.string().optional(),
  event_name: z.string(),
  trigger: z.string(),
  params: z.record(z.string(), z.string()).default({}),
}).strict();

const Ecommerce = z.object({
  enabled: z.boolean().default(false),
  trigger: z.string().optional(),
  allowed_event_names: z.array(z.string()).default([]),
  note: z.string().optional(),
}).strict().optional();

const GTMWeb = z.object({
  enabled: z.boolean(),
  built_in_variables: z.array(z.string()).default([]),
  data_layer_variables: z.array(DLV).default([]),
  triggers: z.array(Trigger).default([]),
  tags: z.array(Tag).default([]),
  ecommerce: Ecommerce,
}).strict();

const SGTM = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().optional(),
  container_id: z.string().optional(),
  clients: z.array(z.unknown()).default([]),
  tags: z.array(z.unknown()).default([]),
  transformations: z.array(z.unknown()).default([]),
  note: z.string().optional(),
}).strict().optional();

const Validation = z.object({
  forbidden_keys: z.object({
    exact: z.array(z.string()).default([]),
    contains: z.array(z.string()).default([]),
    patterns: z.array(z.string()).default([]),
  }).strict().optional(),
  required_checks: z.array(z.string()).default([]),
  publish_gate: z.record(z.string(), z.unknown()).optional(),
  destructive_change_guard: z.record(z.string(), z.unknown()).optional(),
  pii_guard: z.record(z.string(), z.unknown()).optional(),
  consent_change_guard: z.record(z.string(), z.unknown()).optional(),
}).strict().optional();

export const McpExecutionSpec = z.object({
  status: z.string(),
  type: z.literal("ga4_gtm_mcp_execution_spec"),
  version: z.literal(1),
  target: Target,
  source_artifacts: SourceArtifacts,
  execution: Execution,
  preflight: Preflight,
  ga4_admin: GA4Admin,
  gtm_web: GTMWeb,
  sgtm: SGTM,
  validation: Validation,
}).strict();

export type McpExecutionSpec = z.infer<typeof McpExecutionSpec>;
```

- [ ] **Step 5: Pass, commit.** `git commit -am "feat(spec): strict zod schema for mcp-execution.yaml"`

---

### Task 2.2: `spec/readSpec.ts`

**Files:**
- Create: `src/spec/readSpec.ts`
- Create: `tests/spec.read.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";

describe("readSpec", () => {
  it("loads and parses the valid fixture", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    expect(spec.type).toBe("ga4_gtm_mcp_execution_spec");
    expect(spec.version).toBe(1);
  });

  it("throws MCPError(SPEC_INVALID) on missing file", async () => {
    await expect(readSpec("tests/fixtures/specs/missing.yaml"))
      .rejects.toMatchObject({ code: "SPEC_INVALID" });
  });

  it("throws MCPError(SPEC_INVALID) on malformed YAML", async () => {
    await expect(readSpec("tests/fixtures/specs/_malformed.yaml"))
      .rejects.toMatchObject({ code: "SPEC_INVALID" });
  });
});
```

Also create `tests/fixtures/specs/_malformed.yaml` with content `: not valid yaml at all` (the leading colon makes it parse-fail).

- [ ] **Step 2: Implement**

```ts
// src/spec/readSpec.ts
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { MCPError } from "../utils/errors.js";
import { McpExecutionSpec } from "./mcpExecutionSpec.schema.js";

export async function readSpec(path: string): Promise<McpExecutionSpec> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    throw new MCPError("SPEC_INVALID", `Could not read spec at ${path}`, { cause: String(e) });
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (e) {
    throw new MCPError("SPEC_INVALID", `Spec YAML failed to parse: ${String(e)}`, { path });
  }

  const result = McpExecutionSpec.safeParse(parsed);
  if (!result.success) {
    throw new MCPError("SPEC_INVALID", "Spec failed schema validation", {
      issues: result.error.issues,
    });
  }
  return result.data;
}
```

- [ ] **Step 3: Pass, commit.** `git commit -am "feat(spec): readSpec loads YAML and validates against zod schema"`

---

### Task 2.3: `spec/validateSpec.ts` (semantic checks beyond the schema)

**Files:**
- Create: `src/spec/validateSpec.ts`
- Create: `tests/fixtures/specs/invalid-ua-fields.yaml`
- Create: `tests/fixtures/specs/invalid-secret-in-spec.yaml`
- Create: `tests/fixtures/specs/invalid-high-card-cd.yaml`
- Create: `tests/fixtures/specs/invalid-per-event-tag.yaml`
- Create: `tests/fixtures/specs/invalid-consent-change.yaml`
- Create: `tests/spec.validation.test.ts`

- [ ] **Step 1: Build the fixtures**

Each fixture is a copy of `valid-web-dry-run.yaml` with the targeted violation injected:

- `invalid-ua-fields.yaml`: add a GA4 tag with `params.event_category: "foo"`.
- `invalid-secret-in-spec.yaml`: add a DLV with `data_layer_variable_name: "oauth_token"`.
- `invalid-high-card-cd.yaml`: add a custom dimension with `parameter_name: "user_id"`.
- `invalid-per-event-tag.yaml`: add five GA4 tags each with a distinct `event_name` instead of using `{{DLV - event_name}}` — this triggers the "per-event tag" detector.
- `invalid-consent-change.yaml`: add a tag with `type: "consent_initialization"` and `consent_change_guard.modify_consent_settings: true` is **not** set.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";
import { validateSpec } from "../src/spec/validateSpec.js";

const cases: Array<[string, string]> = [
  ["invalid-ua-fields.yaml", "SPEC_INVALID"],
  ["invalid-secret-in-spec.yaml", "SECRET_DETECTED"],
  ["invalid-high-card-cd.yaml", "PII_DETECTED"],
  ["invalid-per-event-tag.yaml", "SPEC_INVALID"],
  ["invalid-consent-change.yaml", "CONSENT_CHANGE_BLOCKED"],
];

describe("validateSpec", () => {
  it("passes the valid fixture", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    const r = validateSpec(spec);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  for (const [file, code] of cases) {
    it(`rejects ${file} with ${code}`, async () => {
      const spec = await readSpec(`tests/fixtures/specs/${file}`).catch((e) => e);
      // For SPEC_INVALID at schema level, readSpec throws. For semantic violations,
      // readSpec succeeds and validateSpec returns the error.
      if (spec instanceof Error) {
        expect((spec as { code?: string }).code).toBe(code);
      } else {
        const r = validateSpec(spec);
        expect(r.ok).toBe(false);
        expect(r.errors.map((e) => e.code)).toContain(code);
      }
    });
  }
});
```

- [ ] **Step 3: Implement**

```ts
// src/spec/validateSpec.ts
import type { McpExecutionSpec } from "./mcpExecutionSpec.schema.js";
import { ErrorCode } from "../utils/errors.js";

export interface ValidationFinding {
  code: ErrorCode;
  message: string;
  path: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
}

const FORBIDDEN_UA_PARAMS = new Set([
  "event_category", "event_action", "event_label", "event_group", "ga4_event_name",
]);

const HIGH_CARD_PARAMS = new Set([
  "user_id", "client_id", "session_id", "transaction_id",
  "request_id", "order_id", "result_id",
]);

const SECRET_KEY_RE = /(token|secret|password|refresh_token|api[_-]?key|oauth|client_secret)/i;
const URL_WITH_QUERY_RE = /^https?:\/\/[^\s?]+\?[^\s]+$/;

export function validateSpec(spec: McpExecutionSpec): ValidationResult {
  const errors: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];

  // 1. UA-style params in any tag.params value or key.
  spec.gtm_web.tags.forEach((tag, i) => {
    for (const k of Object.keys(tag.params)) {
      if (FORBIDDEN_UA_PARAMS.has(k)) {
        errors.push({ code: "SPEC_INVALID", message: `Tag "${tag.name}" uses forbidden UA-style param "${k}"`, path: `gtm_web.tags[${i}].params.${k}` });
      }
    }
  });

  // 2. Secret-shaped keys anywhere in DLVs or custom-dim param names.
  spec.gtm_web.data_layer_variables.forEach((dlv, i) => {
    if (SECRET_KEY_RE.test(dlv.data_layer_variable_name) || SECRET_KEY_RE.test(dlv.name)) {
      errors.push({ code: "SECRET_DETECTED", message: `DLV "${dlv.name}" looks like a credential`, path: `gtm_web.data_layer_variables[${i}]` });
    }
  });
  // also param values
  spec.gtm_web.tags.forEach((tag, i) => {
    for (const [k, v] of Object.entries(tag.params)) {
      if (URL_WITH_QUERY_RE.test(v)) {
        errors.push({ code: "PII_DETECTED", message: `Tag "${tag.name}" param "${k}" is a full URL with query string`, path: `gtm_web.tags[${i}].params.${k}` });
      }
    }
  });

  // 3. High-cardinality custom dimensions.
  spec.ga4_admin.custom_dimensions.forEach((cd, i) => {
    if (HIGH_CARD_PARAMS.has(cd.parameter_name)) {
      errors.push({ code: "PII_DETECTED", message: `Custom dimension "${cd.parameter_name}" is high-cardinality and disallowed`, path: `ga4_admin.custom_dimensions[${i}]` });
    }
  });

  // 4. Per-event tag explosion: more than 2 ga4_event tags whose event_name is a literal
  //    (i.e. not a template like {{...}}) is the failure pattern.
  const literalEventTags = spec.gtm_web.tags.filter(
    (t) => t.type === "ga4_event" && !/^\{\{.*\}\}$/.test(t.event_name) && t.event_name !== "page_view",
  );
  if (literalEventTags.length > 1) {
    errors.push({
      code: "SPEC_INVALID",
      message: `Per-event GTM tag pattern detected (${literalEventTags.length} literal-event tags). Use the reusable GA4 - User Event tag with {{DLV - event_name}}.`,
      path: "gtm_web.tags",
    });
  }

  // 5. Consent guard: if any tag is a consent-initialization/settings tag and
  //    validation.consent_change_guard.modify_consent_settings !== true, block.
  const consentTagTypes = new Set(["consent_initialization", "consent_settings"]);
  const consentChange = spec.gtm_web.tags.some((t) => consentTagTypes.has(t.type as string));
  const consentApproved = spec.validation?.consent_change_guard?.modify_consent_settings === true;
  if (consentChange && !consentApproved) {
    errors.push({ code: "CONSENT_CHANGE_BLOCKED", message: "Spec modifies consent without explicit approval", path: "validation.consent_change_guard" });
  }

  // 6. Missing target IDs when not in pure dry-run placeholder mode.
  if (spec.execution.mode !== "dry_run") {
    if (!spec.target.ga4_property_id) {
      errors.push({ code: "MISSING_TARGET_ID", message: "ga4_property_id is required for non-dry-run mode", path: "target.ga4_property_id" });
    }
    if (!spec.target.gtm_account_id || !spec.target.gtm_web_container_id) {
      errors.push({ code: "MISSING_TARGET_ID", message: "gtm_account_id and gtm_web_container_id are required for non-dry-run mode", path: "target" });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
```

- [ ] **Step 4: Pass, commit.** `git commit -am "feat(spec): validateSpec — UA/PII/secret/per-event/consent checks"`

---

### Task 2.4: `summarize_mcp_execution_spec`

**Files:**
- Create: `src/spec/summarize.ts`
- Create: `tests/spec.summarize.test.ts`

- [ ] **Step 1: Test** — produces a stable, plain-text human summary containing: env, mode, GA4 property, GTM container, counts of CDs/CMs/key events, GTM tag/trigger counts, ecommerce on/off, sGTM on/off, all four gate booleans.

```ts
import { describe, it, expect } from "vitest";
import { readSpec } from "../src/spec/readSpec.js";
import { summarizeSpec } from "../src/spec/summarize.js";

describe("summarizeSpec", () => {
  it("produces a deterministic summary including all gates", async () => {
    const spec = await readSpec("tests/fixtures/specs/valid-web-dry-run.yaml");
    const summary = summarizeSpec(spec);
    expect(summary).toContain("environment: dev");
    expect(summary).toContain("publish_allowed: false");
    expect(summary).toContain("create_container_version_allowed: false");
    expect(summary).toContain("destructive_changes_allowed: false");
    expect(summary).toContain("gtm_web.tags:");
  });
});
```

- [ ] **Step 2: Implement** — deterministic line-by-line summary. Sort dictionary keys with `stableStringify` when needed.

- [ ] **Step 3: Pass, commit.** `git commit -am "feat(spec): summarizeSpec for human-readable plan overview"`

---

## Milestone 3 — Safety Guards

Each guard is a pure function with a focused test file. Implement in this order so later guards can depend on earlier helpers.

### Task 3.1: `safety/piiGuards.ts`

**Files:** `src/safety/piiGuards.ts`, `tests/piiGuards.test.ts`

- [ ] **Step 1: Test cases**

```ts
import { describe, it, expect } from "vitest";
import { findPiiViolations } from "../src/safety/piiGuards.js";

describe("piiGuards.findPiiViolations", () => {
  it("flags raw email/name/phone/ip/user_agent param keys", () => {
    expect(findPiiViolations({ params: { email: "x", phone: "x" } }).length).toBe(2);
  });

  it("flags full URL with query string as a value", () => {
    expect(findPiiViolations({ params: { ref: "https://x.com/page?q=1" } }).length).toBe(1);
  });

  it("ALLOWS the GTM built-in variable named Referrer (the name itself is not a violation)", () => {
    expect(findPiiViolations({ built_in_variables: ["Referrer"] }).length).toBe(0);
  });

  it("flags raw 'referrer' as an event param even though the built-in is allowed", () => {
    expect(findPiiViolations({ params: { referrer: "{{Referrer}}" } }).length).toBe(1);
  });
});
```

- [ ] **Step 2: Implement** — exports `findPiiViolations(input): Array<{code,message,path}>`.

- [ ] **Step 3: Pass, commit.** `git commit -am "feat(safety): PII guard — keys, full-URL values, Referrer built-in OK"`

---

### Task 3.2: `safety/destructiveChangeGuards.ts`

**Files:** `src/safety/destructiveChangeGuards.ts`, `tests/destructiveChangeGuards.test.ts`

- [ ] **Step 1: Test** — given a diff containing `delete` operations, returns blocked unless `destructive_changes_allowed: true` in spec.

- [ ] **Step 2: Implement** — pure function takes `(diff, spec) → BlockedFinding[]`. Default rule set: any delete tag/trigger/variable, any archive of GA4 custom def, any patch of an existing prod tag whose name doesn't appear in the spec.

- [ ] **Step 3: Commit.** `git commit -am "feat(safety): destructive change guard blocks deletes/archives by default"`

---

### Task 3.3: `safety/workspaceGuards.ts`

**Files:** `src/safety/workspaceGuards.ts`, `tests/workspaceGuards.test.ts`

- [ ] **Step 1: Test cases**

```ts
import { describe, it, expect } from "vitest";
import { assertWorkspaceSafe, checkCapacity } from "../src/safety/workspaceGuards.js";

describe("workspaceGuards", () => {
  it("rejects the live/default workspace", () => {
    expect(() =>
      assertWorkspaceSafe({ workspaceId: "0", name: "Default Workspace" }),
    ).toThrow(/WORKSPACE_UNSAFE/);
  });

  it("blocks when GTM has no free workspace slots", () => {
    const r = checkCapacity({ existingWorkspaces: 3, maxWorkspaces: 3 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("WORKSPACE_CAPACITY_BLOCKED");
  });

  it("passes when one slot is free", () => {
    expect(checkCapacity({ existingWorkspaces: 2, maxWorkspaces: 3 }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Implement** — `assertWorkspaceSafe` throws `MCPError("WORKSPACE_UNSAFE", ...)`; `checkCapacity` returns `{ok, code?, message?}`.

- [ ] **Step 3: Commit.** `git commit -am "feat(safety): workspace guards — live workspace and capacity checks"`

---

### Task 3.4: `safety/versionGuards.ts`

**Files:** `src/safety/versionGuards.ts`, `tests/versionGuards.test.ts`

- [ ] **Step 1: Test** — gate denies when ANY of the following is false: `spec.execution.create_container_version_allowed`, `approval_token` present, `diff_report_path` exists, `workspace_id !== "0"`, `unresolved_blocked_items: 0`, `unresolved_validation_errors: 0`.

```ts
import { describe, it, expect } from "vitest";
import { gateVersionCreation } from "../src/safety/versionGuards.js";

describe("versionGuards.gateVersionCreation", () => {
  const okInput = {
    spec: { execution: { create_container_version_allowed: true } } as any,
    approval_token: "tok",
    diff_report_path: "tests/fixtures/specs/valid-web-dry-run.yaml", // any existing file
    workspace_id: "1",
    unresolved_blocked_items: 0,
    unresolved_validation_errors: 0,
  };

  it("passes when every condition is satisfied", async () => {
    const r = await gateVersionCreation(okInput);
    expect(r.ok).toBe(true);
  });

  it("blocks if spec flag is false", async () => {
    const r = await gateVersionCreation({ ...okInput, spec: { execution: { create_container_version_allowed: false } } as any });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("VERSION_CREATION_BLOCKED");
  });

  it("blocks if approval_token is missing", async () => {
    const r = await gateVersionCreation({ ...okInput, approval_token: "" });
    expect(r.ok).toBe(false);
  });

  it("blocks on the live workspace", async () => {
    const r = await gateVersionCreation({ ...okInput, workspace_id: "0" });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Implement** — collects all failing conditions and returns them in `details.reasons` so the caller can show every blocker, not just the first.

- [ ] **Step 3: Commit.** `git commit -am "feat(safety): version-creation gate with multi-reason output"`

---

### Task 3.5: `safety/publishGuards.ts`

**Files:** `src/safety/publishGuards.ts`, `tests/publishGuards.test.ts`

- [ ] **Step 1: Test** — same shape as version gate but adds: `spec.execution.publish_allowed`, `validation_report_path` exists AND its content reads `"passed"`, `environment` matches `spec.target.environment`, `version_id` is present, `publish_scope_present: true`, `operator_requested_publish: true`.

- [ ] **Step 2: Implement** — multi-reason output. Default behavior is refuse.

- [ ] **Step 3: Commit.** `git commit -am "feat(safety): publish gate — never publishes by accident"`

---

### Task 3.6: `safety/consentGuards.ts`

**Files:** `src/safety/consentGuards.ts`, `tests/consentGuards.test.ts`

- [ ] **Step 1: Test** — any spec or apply-plan that touches consent tags returns blocked unless `validation.consent_change_guard.modify_consent_settings === true`.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit.** `git commit -am "feat(safety): consent guard blocks consent changes by default"`

---

### Task 3.7: `safety/approvalGate.ts`

**Files:** `src/safety/approvalGate.ts`, `tests/approvalGate.test.ts`

- [ ] **Step 1: Test** — given `(action, spec, args)`, returns `{ok}` only when (a) the action's spec-level flag is true AND (b) `args.approval_token` is a non-empty string.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit.** `git commit -am "feat(safety): generic approval gate"`

---

### Task 3.8: `safety/auditLog.ts`

**Files:** `src/safety/auditLog.ts`, `tests/auditLog.test.ts`

- [ ] **Step 1: Test** — `audit("spec_loaded", {spec_path, mode})` appends a JSON line to `.audit/audit-YYYY-MM-DD.log`. `audit("publish_blocked", {token: "abc123"})` — the `token` field is redacted in the written line.

- [ ] **Step 2: Implement** using `utils/redact.ts` for every payload before write.

- [ ] **Step 3: Commit.** `git commit -am "feat(safety): JSON-line audit log with mandatory redaction"`

---

### Task 3.9: `safety/toolMetadataGuards.ts`

**Files:** `src/safety/toolMetadataGuards.ts`, `tests/toolMetadataGuards.test.ts`

- [ ] **Step 1: Test** — pure function `assertSafeToolMetadata(tools: Array<{name,description,annotations?}>)`:
  - Every description starts with one of `[read-only]`, `[dry-run-capable write]`, `[write — non-live workspace only]`, `[gated]`, `[gated dangerous]`.
  - No description contains any of: `bypass`, `ignore approval`, `skip validation`, `force`, `prompt-inject`, "you should", "always", "must apply" — i.e. no instructional or jailbreak-shaped language directed at the model.
  - Every tool whose label is `[gated]` or `[gated dangerous]` has an `approval_token` field in its input schema.

```ts
import { describe, it, expect } from "vitest";
import { assertSafeToolMetadata } from "../src/safety/toolMetadataGuards.js";

describe("toolMetadataGuards", () => {
  it("accepts a well-labeled tool", () => {
    expect(() => assertSafeToolMetadata([{ name: "read_x", description: "[read-only] Returns x." }])).not.toThrow();
  });

  it("rejects unlabeled descriptions", () => {
    expect(() => assertSafeToolMetadata([{ name: "x", description: "Does something." }])).toThrow();
  });

  it("rejects instructional verbs", () => {
    expect(() => assertSafeToolMetadata([{ name: "x", description: "[read-only] You should always run this first." }])).toThrow();
  });
});
```

- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit.** `git commit -am "feat(safety): tool metadata guard rejects unsafe descriptions"`

---

### Task 3.10: M0–M3 wrap-up — wire the three validator tools

This task ends the M0–M3 pass. After it, `node dist/server.js` boots a real (but small) validator MCP.

**Files:**
- Create: `src/tools/readTools.ts`
- Create: `src/tools/validateTools.ts`
- Modify: `src/server.ts` (replace M0 `ping` placeholder)
- Modify: `tests/server.boot.test.ts`

- [ ] **Step 1: Update boot test**

```ts
// tests/server.boot.test.ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";
import { assertSafeToolMetadata } from "../src/safety/toolMetadataGuards.js";

describe("server bootstrap", () => {
  it("registers exactly the three M0-M3 tools", () => {
    const { tools } = buildServer();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "read_mcp_execution_spec",
      "summarize_mcp_execution_spec",
      "validate_mcp_execution_spec",
    ]);
  });

  it("every registered tool passes assertSafeToolMetadata", () => {
    const { tools } = buildServer();
    expect(() => assertSafeToolMetadata(tools)).not.toThrow();
  });
});
```

Run: `npm test -- server.boot` → FAIL (server still has `ping`).

- [ ] **Step 2: Implement `tools/readTools.ts`** (just the spec reader for this pass; the GA4/GTM readers stay deferred to M7).

```ts
// src/tools/readTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { MCPError } from "../utils/errors.js";

export interface ToolMeta {
  name: string;
  description: string;
  hasApprovalToken: boolean;
}

export function registerReadTools(server: McpServer, registered: ToolMeta[]) {
  server.registerTool(
    "read_mcp_execution_spec",
    {
      description: "[read-only] Loads and returns the parsed mcp-execution.yaml at the given path. Does not call any Google API.",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      try {
        const spec = await readSpec(path);
        return { content: [{ type: "text", text: JSON.stringify(spec, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "read_mcp_execution_spec", description: "[read-only] Loads and returns the parsed mcp-execution.yaml at the given path. Does not call any Google API.", hasApprovalToken: false });
}
```

- [ ] **Step 3: Implement `tools/validateTools.ts`**

```ts
// src/tools/validateTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readSpec } from "../spec/readSpec.js";
import { validateSpec } from "../spec/validateSpec.js";
import { summarizeSpec } from "../spec/summarize.js";
import { MCPError } from "../utils/errors.js";
import type { ToolMeta } from "./readTools.js";

export function registerValidateTools(server: McpServer, registered: ToolMeta[]) {
  const validateDesc =
    "[read-only] Runs schema and semantic validation on a spec file and returns ok/warnings/errors. Does not call any Google API.";
  server.registerTool(
    "validate_mcp_execution_spec",
    { description: validateDesc, inputSchema: { path: z.string() } },
    async ({ path }) => {
      try {
        const spec = await readSpec(path);
        const result = validateSpec(spec);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "validate_mcp_execution_spec", description: validateDesc, hasApprovalToken: false });

  const summaryDesc =
    "[read-only] Returns a human-readable summary of the spec, including all four gate booleans.";
  server.registerTool(
    "summarize_mcp_execution_spec",
    { description: summaryDesc, inputSchema: { path: z.string() } },
    async ({ path }) => {
      try {
        const spec = await readSpec(path);
        return { content: [{ type: "text", text: summarizeSpec(spec) }] };
      } catch (e) {
        if (e instanceof MCPError) {
          return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
        }
        throw e;
      }
    },
  );
  registered.push({ name: "summarize_mcp_execution_spec", description: summaryDesc, hasApprovalToken: false });
}
```

- [ ] **Step 4: Replace `src/server.ts`**

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools, type ToolMeta } from "./tools/readTools.js";
import { registerValidateTools } from "./tools/validateTools.js";
import { assertSafeToolMetadata } from "./safety/toolMetadataGuards.js";
import { logger } from "./utils/logger.js";

export function buildServer() {
  const server = new McpServer({
    name: "ga4-gtm-config-mcp",
    version: "0.1.0",
  });

  const tools: ToolMeta[] = [];
  registerReadTools(server, tools);
  registerValidateTools(server, tools);

  assertSafeToolMetadata(tools);
  for (const t of tools) logger.info("tool_registered", { name: t.name });

  return { server, tools };
}

async function main() {
  const { server } = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
```

- [ ] **Step 5: Run.**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Smoke test the server boots.**

Run: `timeout 1 node dist/server.js < /dev/null` (the server will exit when stdin closes, or after 1s — either is fine; the important thing is no crash, no stdout, and a JSON `tool_registered` line per tool on stderr).

- [ ] **Step 7: Commit.** `git commit -am "feat(server): wire 3 validator tools and replace ping placeholder (M0-M3 slice complete)"`

---

## Milestone 4 — Google API Clients (read side)

> **Deferred to next pass.** This milestone and everything below depend on `googleapis`, which is intentionally not in `package.json` for this M0–M3 slice.

### Task 4.1: `auth/scopes.ts` + `auth/googleAuth.ts`

**Files:** `src/auth/scopes.ts`, `src/auth/googleAuth.ts`, `tests/auth.test.ts`

- [ ] **Step 1: Test** — `buildAuth({mode:'read'})` returns an object with the read scopes attached; `buildAuth({mode:'publish'})` rejects unless `INCLUDE_PUBLISH_SCOPE=1` env is set. The test stubs `process.env` with `vi.stubEnv`.

- [ ] **Step 2: Implement**

```ts
// src/auth/scopes.ts
export const READ_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

export const WRITE_WORKSPACE_SCOPES = [
  ...READ_SCOPES,
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/analytics.edit",
] as const;

export const PUBLISH_SCOPES = [
  ...WRITE_WORKSPACE_SCOPES,
  "https://www.googleapis.com/auth/tagmanager.publish",
] as const;
```

```ts
// src/auth/googleAuth.ts
import { google } from "googleapis";
import { READ_SCOPES, WRITE_WORKSPACE_SCOPES, PUBLISH_SCOPES } from "./scopes.js";
import { MCPError } from "../utils/errors.js";

type AuthMode = "read" | "write" | "publish";

export async function buildAuth(opts: { mode: AuthMode }) {
  if (opts.mode === "publish" && process.env.INCLUDE_PUBLISH_SCOPE !== "1") {
    throw new MCPError("PERMISSION_DENIED", "Publish scope requires INCLUDE_PUBLISH_SCOPE=1 in env to be opt-in.");
  }
  const scopes =
    opts.mode === "read" ? READ_SCOPES
    : opts.mode === "write" ? WRITE_WORKSPACE_SCOPES
    : PUBLISH_SCOPES;

  const auth = new google.auth.GoogleAuth({ scopes: [...scopes] });
  // GoogleAuth picks up GOOGLE_APPLICATION_CREDENTIALS automatically.
  // For OAuth refresh-token flow, callers set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN
  // and we wire OAuth2 explicitly — implement only when needed by a real call.
  return auth;
}
```

- [ ] **Step 3: Commit.** `git commit -am "feat(auth): scope tiers and least-privilege Google auth factory"`

---

### Task 4.2: `ga4/capabilities.ts` and `ga4/adminClient.ts`

**Files:** `src/ga4/capabilities.ts`, `src/ga4/adminClient.ts`, `tests/ga4.capabilities.test.ts`

- [ ] **Step 1: Test** — capabilities map declares: `customDimensions: 'stable'`, `customMetrics: 'stable'`, `keyEvents: 'stable'`, `measurementProtocolSecrets: 'stable'`, `properties: 'stable'`, `dataStreams: 'stable'`. The helper `capabilityOf('archive_custom_dimension')` returns `'unsupported'`.

- [ ] **Step 2: Implement**

```ts
// src/ga4/capabilities.ts
export type Capability = "stable" | "beta" | "alpha" | "unsupported";

const MAP: Record<string, Capability> = {
  read_property: "stable",
  list_data_streams: "stable",
  list_custom_dimensions: "stable",
  create_custom_dimension: "stable",
  update_custom_dimension: "stable",
  archive_custom_dimension: "unsupported",
  list_custom_metrics: "stable",
  create_custom_metric: "stable",
  update_custom_metric: "stable",
  list_key_events: "stable",
  create_key_event: "stable",
  update_key_event: "stable",
  list_mp_secrets_metadata: "stable",
  create_mp_secret: "stable",
};

export function capabilityOf(op: string): Capability {
  return MAP[op] ?? "unsupported";
}
```

```ts
// src/ga4/adminClient.ts
import { google, analyticsadmin_v1beta } from "googleapis";
import { buildAuth } from "../auth/googleAuth.js";

export async function buildGa4Admin(mode: "read" | "write" = "read"): Promise<analyticsadmin_v1beta.Analyticsadmin> {
  const auth = await buildAuth({ mode });
  return google.analyticsadmin({ version: "v1beta", auth });
}
```

- [ ] **Step 3: Commit.** `git commit -am "feat(ga4): capability map and admin client factory"`

---

### Task 4.3: GA4 read modules

**Files:** `src/ga4/{properties,streams,customDimensions,customMetrics,keyEvents,measurementProtocolSecrets}.ts`

Each file exports one or two read functions that take the admin client + IDs and return the raw API response. These are thin wrappers — keep them small. No tests at this layer (covered by `currentState` tests later); they would just re-test the googleapis SDK.

Example pattern (apply to all six):

```ts
// src/ga4/customDimensions.ts
import type { analyticsadmin_v1beta } from "googleapis";

export async function listCustomDimensions(
  client: analyticsadmin_v1beta.Analyticsadmin,
  propertyId: string,
) {
  const res = await client.properties.customDimensions.list({ parent: propertyId, pageSize: 200 });
  return res.data.customDimensions ?? [];
}
```

For `measurementProtocolSecrets.ts`, the list endpoint returns metadata (name, display name); the `secretValue` field is only returned at create time. Implement a `listMetadata` that explicitly drops `secretValue` from the response before returning, so even an accidental future change to the API can't leak it.

- [ ] **Step 1: Implement each file.**
- [ ] **Step 2: Commit.** `git commit -am "feat(ga4): read wrappers for property/streams/dimensions/metrics/keyEvents/MP secrets metadata"`

---

### Task 4.4: `gtm/tagManagerClient.ts` and GTM read modules

**Files:** `src/gtm/{tagManagerClient,accounts,containers,workspaces,builtInVariables,variables,triggers,tags,versions,preview,publish}.ts`

Implement the read functions for accounts/containers/workspaces/builtInVariables/variables/triggers/tags, plus capacity helper.

```ts
// src/gtm/tagManagerClient.ts
import { google, tagmanager_v2 } from "googleapis";
import { buildAuth } from "../auth/googleAuth.js";

export async function buildGtm(mode: "read" | "write" | "publish" = "read"): Promise<tagmanager_v2.Tagmanager> {
  const auth = await buildAuth({ mode });
  return google.tagmanager({ version: "v2", auth });
}
```

```ts
// src/gtm/workspaces.ts
import type { tagmanager_v2 } from "googleapis";

const GTM_MAX_WORKSPACES = 3; // platform limit per container

export async function listWorkspaces(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
) {
  const res = await gtm.accounts.containers.workspaces.list({
    parent: `accounts/${accountId}/containers/${containerId}`,
  });
  return res.data.workspace ?? [];
}

export async function workspaceCapacity(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
) {
  const list = await listWorkspaces(gtm, accountId, containerId);
  return { existing: list.length, max: GTM_MAX_WORKSPACES, freeSlots: GTM_MAX_WORKSPACES - list.length };
}

export async function createWorkspace(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  name: string,
) {
  const res = await gtm.accounts.containers.workspaces.create({
    parent: `accounts/${accountId}/containers/${containerId}`,
    requestBody: { name, description: "Created by ga4-gtm-config-mcp" },
  });
  return res.data;
}
```

Implement the rest (`accounts`, `containers`, `builtInVariables`, `variables`, `triggers`, `tags`) following the same pattern. For `versions.ts`, `preview.ts`, `publish.ts`, define the write functions but with a comment that they MUST only be invoked via the gated tools (we will enforce this in the tools layer).

- [ ] **Step 1: Implement all read modules + workspace create.**
- [ ] **Step 2: Commit.** `git commit -am "feat(gtm): client factory and read wrappers + workspace create with capacity helper"`

---

## Milestone 5 — Diff Engine

### Task 5.1: `planner/desiredState.ts`

**Files:** `src/planner/desiredState.ts`, `tests/planner.desiredState.test.ts`

- [ ] **Step 1: Test** — given the valid fixture spec, `toDesiredState(spec)` produces a normalized object with sorted arrays of: GA4 custom dims, custom metrics, key events; GTM built-in vars, DLVs, triggers, tags. Names are the unique key. Sorting is alphabetical by name.

- [ ] **Step 2: Implement** the normalizer.

- [ ] **Step 3: Commit.** `git commit -am "feat(planner): desiredState normalizer with stable ordering"`

---

### Task 5.2: `planner/currentState.ts`

**Files:** `src/planner/currentState.ts`, `tests/planner.currentState.test.ts`

- [ ] **Step 1: Test** — given mocked API responses (no network), `toCurrentState(...)` normalizes into the same shape as `DesiredState` so diff can compare them directly. MP secret values are dropped here as a second layer of defense.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit.** `git commit -am "feat(planner): currentState normalizer dropping MP secret values"`

---

### Task 5.3: `planner/diff.ts`

**Files:** `src/planner/diff.ts`, `tests/diff.test.ts`

- [ ] **Step 1: Test cases**

```ts
import { describe, it, expect } from "vitest";
import { diffStates } from "../src/planner/diff.js";

describe("diffStates", () => {
  const desired = {
    ga4: { customDimensions: [{ name: "feature_name", scope: "EVENT" }] },
    gtm: { variables: [], triggers: [], tags: [], builtInVariables: ["Page URL"] },
  };
  const currentEmpty = { ga4: { customDimensions: [] }, gtm: { variables: [], triggers: [], tags: [], builtInVariables: [] } };

  it("classifies a missing entity as create", () => {
    const d = diffStates(desired, currentEmpty);
    expect(d.creates.map((c) => c.name)).toContain("feature_name");
  });

  it("returns stable ordering across runs", () => {
    expect(diffStates(desired, currentEmpty)).toEqual(diffStates(desired, currentEmpty));
  });

  it("classifies identical entities as unchanged", () => {
    const d = diffStates(desired, desired as any);
    expect(d.creates).toEqual([]);
    expect(d.unchanged.length).toBeGreaterThan(0);
  });

  it("dry-run diff records zero writes (no API calls invoked)", () => {
    // The function is pure — nothing to mock — so this is satisfied by construction.
    const d = diffStates(desired, currentEmpty);
    expect(d).toHaveProperty("creates");
    expect(d).toHaveProperty("blocked");
  });
});
```

- [ ] **Step 2: Implement** the deterministic diff. Use `stableStringify` to compare entity configs.

- [ ] **Step 3: Commit.** `git commit -am "feat(planner): deterministic state diff (creates/updates/unchanged/skipped/blocked)"`

---

### Task 5.4: `gtmPayloads.test.ts` — payload shape regression

**Files:** `tests/gtmPayloads.test.ts`

- [ ] **Step 1: Test** — `desiredVariableToGtmPayload(dlv)` returns a `{name, type:'v', parameter:[{type:'template', key:'name', value:'event_type'}, {type:'integer', key:'dataLayerVersion', value:'2'}]}` shape matching GTM API expectations. Likewise for trigger and tag.

- [ ] **Step 2: Implement helpers in `planner/desiredState.ts`** (extend the file).

- [ ] **Step 3: Commit.** `git commit -am "test(planner): pin GTM payload shapes for variables/triggers/tags"`

---

## Milestone 6 — Apply Engine

### Task 6.1: `planner/applyPlan.ts`

**Files:** `src/planner/applyPlan.ts`, `tests/planner.applyPlan.test.ts`

- [ ] **Step 1: Test** — given a diff with 2 creates and `dry_run: true`, `applyPlan({diff, dryRun:true, ...})` returns `{applied: 0, skipped: 2, blocked: 0, callsMade: 0}` (assert via a mock writer that counts invocations and is asserted to be `not called`). With `dry_run: false`, the same input invokes the writer twice and returns `applied: 2`.

- [ ] **Step 2: Implement** the orchestrator. Inject writers as dependencies (no real network).

- [ ] **Step 3: Commit.** `git commit -am "feat(planner): applyPlan orchestrator — dry_run guarantees zero writes"`

---

### Task 6.2: GTM workspace apply path

**Files:** add upsert helpers in `src/gtm/{builtInVariables,variables,triggers,tags}.ts`

- [ ] **Step 1: Test** — `upsertVariable(client, ws, payload, existing)` with `existing === undefined` calls `create`; with `existing.config` equal to payload it returns `unchanged`; with differing config it calls `update`.

- [ ] **Step 2: Implement each module's `upsert*` function.**

- [ ] **Step 3: Commit.** `git commit -am "feat(gtm): upsert helpers for built-in vars/variables/triggers/tags"`

---

### Task 6.3: GA4 admin apply path

**Files:** add upsert helpers in `src/ga4/{customDimensions,customMetrics,keyEvents}.ts`

- [ ] **Step 1: Test** — `upsertCustomDimension(client, propertyId, desired, existing)` follows the same `create | unchanged | update` shape. **No archive** under any condition (assert in test that `archive_custom_dimension` is never invoked even when `destructive_changes_allowed: true` — archive remains unsupported and surfaces as `API_UNSUPPORTED`).

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit.** `git commit -am "feat(ga4): upsert helpers for CDs/CMs/key events; archive remains unsupported"`

---

### Task 6.4: `gtm/versions.ts` create-version (called only from gated tool)

- [ ] **Step 1: Test** — `createVersion(client, ws)` exists and would call `workspaces.create_version`. The test does **not** call this function directly; it asserts the function throws if invoked with a workspaceId of `"0"`. (Real call coverage happens at the tool layer with mocks.)

- [ ] **Step 2: Implement.**

```ts
// src/gtm/versions.ts
import type { tagmanager_v2 } from "googleapis";
import { MCPError } from "../utils/errors.js";

// IMPORTANT: workspaces.create_version REMOVES the workspace from the container.
// Never call from dry-run paths. Only invoke via tools/versionTools.ts after the gate passes.
export async function createVersion(
  gtm: tagmanager_v2.Tagmanager,
  accountId: string,
  containerId: string,
  workspaceId: string,
  name: string,
  notes?: string,
) {
  if (workspaceId === "0") {
    throw new MCPError("WORKSPACE_UNSAFE", "Cannot create a version from the live/default workspace");
  }
  const res = await gtm.accounts.containers.workspaces.create_version({
    path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
    requestBody: { name, notes },
  });
  return res.data;
}
```

- [ ] **Step 3: Commit.** `git commit -am "feat(gtm): create_version helper — refuses live workspace"`

---

### Task 6.5: `gtm/preview.ts` (read-only)

- [ ] **Step 1: Implement** — returns workspace metadata + a fixed manual validation checklist string:

```ts
export function manualValidationChecklist(): string[] {
  return [
    "Open Tag Assistant Companion in Chrome and enter the GTM container ID.",
    "Trigger the userevent pageview from the staging page and verify GA4 - Page View fires.",
    "Trigger one userevent event per approved event_name and verify GA4 - User Event fires with the right params.",
    "In GA4 DebugView, confirm each event arrives with the expected parameters and no PII.",
    "If ecommerce is enabled, validate at least one ecommerce event end-to-end.",
  ];
}
```

The tool can return this list even when the API does not expose a preview URL, so we never fabricate links.

- [ ] **Step 2: Commit.** `git commit -am "feat(gtm): preview metadata + manual validation checklist"`

---

### Task 6.6: `gtm/publish.ts`

- [ ] **Step 1: Implement** — single function `publishVersion(client, accountId, containerId, versionId)`; refuses if `INCLUDE_PUBLISH_SCOPE !== "1"`.

- [ ] **Step 2: Commit.** `git commit -am "feat(gtm): publishVersion — only callable with publish scope enabled in env"`

---

## Milestone 7 — Tools (MCP Surface)

Each tool is registered with: input schema (Zod), output content blocks, and explicit label prefix. All tools live in `src/tools/<group>.ts` and export a `register<Group>Tools(server)` function called from `server.ts`. After every tool registration, push the `{name, description, hasApprovalToken}` triple into a `registeredTools` array. `server.ts` runs `assertSafeToolMetadata(registeredTools)` before `connect()`.

### Task 7.1: `tools/readTools.ts`

Tools registered:

| Tool | Label | Description (final, do not edit) |
|------|-------|----------------------------------|
| `read_mcp_execution_spec` | `[read-only]` | Loads and returns the parsed mcp-execution.yaml at the given path. Does not call any Google API. |
| `read_ga4_state` | `[read-only]` | Returns normalized GA4 property, streams, custom dimensions, custom metrics, key events, and Measurement Protocol secret metadata only. Never returns secret values. |
| `read_gtm_state` | `[read-only]` | Returns normalized GTM container state for the given account/container, including workspace capacity. |

- [ ] **Step 1: Test** — register the three tools on a fresh server; assert `assertSafeToolMetadata` passes.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit.** `git commit -am "feat(tools): read_mcp_execution_spec / read_ga4_state / read_gtm_state"`

---

### Task 7.2: `tools/validateTools.ts`

| Tool | Label | Description |
|------|-------|-------------|
| `validate_mcp_execution_spec` | `[read-only]` | Runs schema and semantic validation on a spec file and returns ok/warnings/errors. Does not call any Google API. |
| `summarize_mcp_execution_spec` | `[read-only]` | Returns a human-readable summary of the spec, including all four gate booleans. |

- [ ] **Step 1: Test + implement + commit.**

---

### Task 7.3: `tools/diffTools.ts`

| Tool | Label | Description |
|------|-------|-------------|
| `diff_ga4_gtm_state` | `[read-only]` | Reads current GA4 and GTM state, normalizes the spec into a desired state, and returns a deterministic diff. Performs no writes. |

- [ ] **Step 1: Test + implement + commit.**

---

### Task 7.4: `tools/applyTools.ts`

| Tool | Label | Description |
|------|-------|-------------|
| `create_gtm_workspace` | `[write — non-live workspace only]` | Creates a new GTM workspace in the given container. Blocks if container is at capacity or if the operator targets the live/default workspace. |
| `apply_gtm_workspace_changes` | `[dry-run-capable write]` | Upserts approved variables, triggers, and tags into the given non-live workspace. Defaults to `dry_run: true`. Never deletes. Never modifies consent unless approved in spec. |
| `apply_ga4_admin_changes` | `[dry-run-capable write]` | Upserts approved GA4 custom dimensions, custom metrics, and key events. Defaults to `dry_run: true`. Never archives. Never stores Measurement Protocol secret values. |

- [ ] **Step 1: Tests** — assert dry_run defaults to true; assert apply with `workspace_id: "0"` returns `WORKSPACE_UNSAFE`; assert collision detection triggers `NAME_COLLISION`.

- [ ] **Step 2: Implement.** Use `applyPlan` from M6, threading the appropriate writers.

- [ ] **Step 3: Commit.** `git commit -am "feat(tools): apply tools default to dry_run; workspace safety enforced"`

---

### Task 7.5: `tools/previewTools.ts`

| Tool | Label | Description |
|------|-------|-------------|
| `get_gtm_preview_info` | `[read-only]` | Returns workspace metadata and a fixed manual Tag Assistant / DebugView checklist. Does not create a version. |

- [ ] **Step 1: Test + implement + commit.**

---

### Task 7.6: `tools/versionTools.ts`

| Tool | Label | Description |
|------|-------|-------------|
| `create_gtm_container_version_gated` | `[gated dangerous]` | Creates a GTM container version from the named workspace. WARNING: this removes the workspace. Requires `spec.execution.create_container_version_allowed: true` and an explicit `approval_token`. |

- [ ] **Step 1: Tests** — confirms gate blocks every missing condition; only the all-conditions-satisfied case proceeds to call `createVersion`.

- [ ] **Step 2: Implement.** Mark `approval_token` as required in Zod input. Mark the tool annotations: `destructiveHint: true`, `readOnlyHint: false`, `idempotentHint: false`.

- [ ] **Step 3: Commit.** `git commit -am "feat(tools): create_gtm_container_version_gated with hard multi-condition gate"`

---

### Task 7.7: `tools/publishTools.ts`

| Tool | Label | Description |
|------|-------|-------------|
| `publish_gtm_version_gated` | `[gated dangerous]` | Publishes a GTM container version. Default behavior is to refuse. Requires every publish-guard condition to pass plus an explicit `approval_token`. |

- [ ] **Step 1: Tests + implement + commit.**

---

### Task 7.8: `server.ts` wires it all up

**Files:** `src/server.ts` (replace placeholder), `tests/server.boot.test.ts` (update)

- [ ] **Step 1: Update the test** to assert all 11 tools are registered and `assertSafeToolMetadata` would pass.

- [ ] **Step 2: Replace `buildServer()`** to call each `register*Tools(server, registeredTools)` and then `assertSafeToolMetadata(registeredTools)` before returning. The old `ping` tool is removed.

- [ ] **Step 3: Commit.** `git commit -am "feat(server): register all 11 tools and assert metadata safety at boot"`

---

### Task 7.9: `tests/toolMetadataGuards.test.ts` — end-to-end registered tools

- [ ] **Step 1: Test** — boot the server in-memory, snapshot every registered tool's `{name, description}`, and run `assertSafeToolMetadata` on the actual snapshot (not on a hand-rolled list). This catches drift.

- [ ] **Step 2: Commit.** `git commit -am "test: tool metadata guard runs against the live registered tool set"`

---

## Milestone 8 — Examples, README, Polish

### Task 8.1: `examples/mcp-execution.example.yaml` + `.env.example`

- [x] **Step 1: Copy the validated fixture** to `examples/mcp-execution.example.yaml`. Leave demo IDs that are obviously placeholders (e.g. `properties/000000000`, `GTM-EXAMPLE`).

- [x] **Step 2: Write `.env.example`** — see §Current Accuracy: shipped `.env.example` documents only the env vars the code actually reads (`GOOGLE_APPLICATION_CREDENTIALS`, `INCLUDE_PUBLISH_SCOPE`) and omits the unused OAuth/target-ID vars from the sketch below.

```env
# One of the two auth paths below — do not commit real values.

# Path A: Service account
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json

# Path B: OAuth refresh token (web flow)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Target IDs (read by tests / examples only; tools take IDs explicitly)
GA4_PROPERTY_ID=
GTM_ACCOUNT_ID=
GTM_WEB_CONTAINER_ID=
GTM_SERVER_CONTAINER_ID=

# Publishing is opt-in even at the scope level
INCLUDE_PUBLISH_SCOPE=
```

- [ ] **Step 3: Commit.** `git commit -am "docs: example spec and .env.example with placeholder values"`

---

### Task 8.2: Rewrite `README.md`

Full README covering all sections required by the spec. Use the structure under §README outline below. Verify against `docs/AGENTS.md` Doc Review Criteria before commit.

- [x] **Step 1: Write the README.**
- [ ] **Step 2: Commit.** `git commit -am "docs: full README — setup, workflows, safety, limitations"`

### README outline

```text
# ga4-gtm-config-mcp

1. What this does / does not do
2. Relationship to google-analytics-implementation-planner
3. Installation
4. Auth setup
   - Service account vs OAuth refresh token
   - Required scopes per mode
   - INCLUDE_PUBLISH_SCOPE opt-in
5. Local run
6. MCP client configuration example (Claude Desktop / Claude Code)
7. Workflows
   7.1 Dry-run validation + diff
   7.2 Workspace apply
   7.3 Manual preview / DebugView validation
   7.4 Container version creation (gated)
   7.5 Publish (gated)
8. Safety rules — explicit list of every guard with one-line summary
9. Known limitations (GA Admin alpha-only paths, MP secret handling, GTM 3-workspace cap)
10. Troubleshooting
```

---

### Task 8.3: Rename plan, write outcome, refresh `AGENTS.md` §10

- [x] **Step 1: Rename** `docs/agents/features/IN-PROGRESS-2026-05-28-build-mcp-server.md` → `EXECUTED-2026-05-28-build-mcp-server.md`. Add `## Outcome` and `## Current Accuracy` sections. (Source name corrected: the file was `IN-PROGRESS-*` by this point, not `PLANNED-*`.)

- [x] **Step 2: Update `AGENTS.md` §10 "Project context"** with verified stack, commands, layout. (No TODO stubs remained — §10 was filled at M0–M3; this pass corrected the two stale facts: `googleapis` is now a listed core dep, and `src/` now lists all 8 subdirs.)

- [ ] **Step 3: Final commit.** `git commit -am "docs: mark plan EXECUTED and refresh AGENTS.md project context"`

---

## Acceptance Criteria (verified 2026-05-28 at M8 completion)

Each item records the evidence observed this pass. Items marked "(via … test)" are verified by mocked unit tests in the passing suite — not by calls against a live Google account; a live end-to-end run against a real GA4 property + GTM container remains an operator step.

- [x] `npm install` succeeds with the pinned lockfile. (deps resolve; full suite runs against installed `node_modules`)
- [x] `npm run typecheck` passes with zero errors. (exit 0)
- [x] `npm test` passes with zero failures; coverage includes every safety guard test. (123/123, 32 files)
- [x] `npm run build` produces `dist/server.js`. (present; server boots from it)
- [x] `node dist/server.js` starts and produces no stdout (stdio is the MCP transport); stderr shows a JSON `info` line per registered tool. (0 stdout bytes; 12 `tool_registered` stderr lines)
- [x] Configure the server in an MCP client and confirm exactly **12** tools appear, each with the labels listed in Milestone 7. (Corrected from "11" — the shipped surface is 12 tools. Count verified via `buildServer()` and on boot; live MCP-client wiring is a manual operator step.)
- [x] `validate_mcp_execution_spec` on `examples/mcp-execution.example.yaml` returns `ok`. (`{ok:true, errors:[]}` via the built `dist/`)
- [x] `diff_ga4_gtm_state` returns a deterministic diff with zero writes. (via `tests/diff.test.ts`, mocked state)
- [x] `apply_gtm_workspace_changes` with `dry_run: true` makes zero API write calls. (via `tests/planner.applyPlan.test.ts` — pins `callsMade === 0`)
- [x] `create_gtm_workspace` against a container at capacity returns `WORKSPACE_CAPACITY_BLOCKED`. (via `tests/workspaceGuards.test.ts`)
- [x] `create_gtm_container_version_gated` without `approval_token` returns `VERSION_CREATION_BLOCKED`. (via `tests/versionGuards.test.ts` at the guard level; the tool wraps the guard and throws `VERSION_CREATION_BLOCKED`)
- [x] `publish_gtm_version_gated` without `approval_token` returns `PUBLISH_BLOCKED`. (via `tests/publishGuards.test.ts` at the guard level; the tool wraps the guard and throws `PUBLISH_BLOCKED`)
- [x] Every test in §Fixtures passes the expected outcome. (`tests/spec.validation.test.ts`, part of the 123)
- [x] No file in `src/`, `tests/`, `examples/`, or `README.md` contains a real OAuth client ID/secret/refresh token, real GA4 property ID, real GTM account/container ID, or real MP secret value. (credential scan and ID scan both clean; the example spec uses obvious placeholders — `properties/000000000`, `G-XXXXXXX000`, `accounts/0000000`)
- [x] No file contains the string `event_category`, `event_action`, or `event_label` outside of `tests/fixtures/specs/invalid-ua-fields.yaml` and the validator that detects them. (grep clean; the only other occurrence is this plan's embedded copy of the validator's constant list)

---

## Post-implementation report (to write into Outcome)

- File-by-file summary of what was created.
- Commands run during build/verify.
- Any API endpoints that were not fully implemented and why (e.g. archive endpoints intentionally absent).
- Remaining manual setup steps:
  - Create Google Cloud project + enable GA Admin API + Tag Manager API.
  - Create OAuth client ID OR service account with GA editor + GTM editor permissions on the target property and container.
  - Decide whether to set `INCLUDE_PUBLISH_SCOPE=1` (separate decision, separate audit trail).

---

## Self-Review (writing-plans skill checklist)

- **Spec coverage** — every section of the user's spec maps to a milestone/task:
  - Read/spec tools → Task 7.1, 7.2; spec types → M2.
  - State tools → Task 7.1, 7.3.
  - Apply tools → Task 7.4.
  - Version/preview/publish tools → Task 7.5, 7.6, 7.7.
  - Safety guards (PII, publish, version, workspace, version, consent, audit, tool metadata, destructive) → M3 tasks 3.1–3.9.
  - Tests, fixtures, README → M8.
  - Error codes → Task 1.1.
  - Auth scopes → Task 4.1.
  - GA4/GTM read modules → M4.
  - Diff engine → M5.
  - Apply engine → M6.

- **Placeholder scan** — no `TBD`, `TODO: implement`, "similar to task X" references in step bodies. Where the implementation is large, an implementation sketch is provided and the spec template is referenced as the authoritative source. The plan itself contains every test verbatim.

- **Type consistency** — `MCPError.code` uses the same 12 codes across tasks; `assertSafeToolMetadata` signature is consistent between 3.9 and 7.9; `applyPlan` signature is consistent between 6.1 and 7.4.

No issues found; plan is complete.

---

## Slice 1 outcome (M0–M3, 2026-05-28)

**Status:** Shipped on branch `feat/m0-m3-validator-slice`. M4–M8 remain planned.

### What landed

20 individual tasks across 4 milestones plus the M3.10 wrap-up, executed via `superpowers:subagent-driven-development` with TDD discipline. One commit per task (or per fix), conventional-commit messages.

| Milestone | Files (src) | Files (tests) | Tests added |
|-----------|-------------|---------------|-------------|
| M0 — foundation | `src/server.ts` | `tests/server.boot.test.ts` | 2 |
| M1 — utils | `src/utils/{errors,redact,stableJson,logger,names}.ts` | 4 test files | 11 |
| M2 — spec | `src/spec/{mcpExecutionSpec.schema,readSpec,validateSpec,summarize}.ts` | 4 test files + 6 fixtures (1 valid, 5 invalid, 1 `_malformed`) | 14 |
| M3 — safety | `src/safety/{piiGuards,destructiveChangeGuards,workspaceGuards,versionGuards,publishGuards,consentGuards,approvalGate,auditLog,toolMetadataGuards}.ts` | 9 test files | 35 (with post-review +3) |
| M3 wrap-up | `src/tools/{readTools,validateTools}.ts` + rewrite `src/server.ts` | rewrite `tests/server.boot.test.ts` | 0 net (replaced 2) |

Final: **68 tests passing, 20 test files, zero failures**, clean `npm run typecheck`, clean `npm run build`. Smoke test (`node dist/server.js`) emits three `tool_registered` JSON lines on stderr and zero bytes on stdout. End-to-end script confirmed every fixture returns the expected validation outcome.

### Three MCP tools registered

| Tool | Label | Behavior |
|------|-------|----------|
| `read_mcp_execution_spec` | `[read-only]` | Loads + parses + zod-validates the YAML at `{path}`. Returns parsed JSON or `MCPError(SPEC_INVALID)`. |
| `validate_mcp_execution_spec` | `[read-only]` | Same load step, then runs `validateSpec` for semantic checks (UA fields, secrets, high-card dims, per-event-tag explosion, consent guard, missing target IDs). Returns `{ok, errors, warnings}`. |
| `summarize_mcp_execution_spec` | `[read-only]` | Deterministic plain-text summary including all four execution gate booleans. |

`assertSafeToolMetadata` runs at server boot AND in the unit test, so a future tool description regression is caught at startup.

### Safety guards in place (used by M4+ tools when they land)

- `piiGuards.findPiiViolations` — forbidden param keys + full-URL-with-query detection; allows the GTM `Referrer` built-in variable name (the violation is using raw referrer VALUES as params).
- `destructiveChangeGuards.findDestructiveChanges` — flags deletes unless `destructive_changes_allowed: true`; archives are `API_UNSUPPORTED` regardless of the flag.
- `workspaceGuards.assertWorkspaceSafe` + `checkCapacity` — rejects `workspaceId === "0"` and `name === "Default Workspace"` unconditionally; enforces GTM 3-workspace-per-container cap.
- `versionGuards.gateVersionCreation`, `publishGuards.gatePublish` — multi-reason default-deny gates that surface every failing condition together.
- `consentGuards.gateConsentChange` — blocks any consent-tag presence unless `validation.consent_change_guard.modify_consent_settings === true`.
- `approvalGate.requireApprovalToken` — generic spec-flag + `approval_token` check for `publish` and `create_version` actions.
- `auditLog.audit` — JSON-line writer to `.audit/audit-YYYY-MM-DD.log` (UTC); EVERY payload passes through `utils/redact` (now covers `private_key`/`credentials` after the post-review fix).
- `toolMetadataGuards.assertSafeToolMetadata` — rejects unlabeled tool descriptions, unsafe phrases (`bypass`, `ignore approval`, `force` as a whole word, etc.), and `[gated*]` tools without `approval_token`.

### Deferred to next pass (M4–M8)

- `googleapis` dependency.
- GA4 Admin and GTM v2 API clients + auth/scopes.
- State normalization (`desiredState`, `currentState`) and the deterministic diff engine.
- The apply orchestrator and GA4/GTM upsert helpers.
- The remaining eight MCP tools (read GA4/GTM state, diff, create workspace, apply workspace/admin changes, preview, create version, publish).
- `examples/mcp-execution.example.yaml`, `.env.example`, full README rewrite.

### Decisions made during execution (worth knowing before the next pass)

1. **`Tag.type` is `z.string()` at the schema layer**, not an enum. Disallowed types (consent, UA-era) parse OK and are rejected by `validateSpec` with the correct semantic error code instead of a generic `SPEC_INVALID`.
2. **`MeasurementProtocol.api_secret.action` accepts the third literal `"manual_create_or_mcp_create_placeholder"`** because the planner template uses exactly that string. Original plan only had two values.
3. **TypeScript pinned to 5.9.3** rather than the just-released 6.x line, for ecosystem maturity (zod v4 / vitest v3 / `@modelcontextprotocol/sdk` v1.29 are all known-working on TS 5.9).
4. **Fixtures `invalid-publish-requested.yaml` and `invalid-version-requested.yaml` were not created.** The §Fixtures table now notes those scenarios are gate-tested inline with synthetic objects (they are not parsed-spec failures, so a YAML fixture doesn't help).
5. **Two safety fixes landed after the final code review:** `utils/redact` now matches `private_key` / `credentials`; `toolMetadataGuards` uses a word-boundary regex for `force` so `"Enforces"` does not trip the guard.

### Acceptance — M0–M3 checklist

- [x] `npm install` succeeds; `googleapis` is not in the dependency tree.
- [x] `npm run typecheck` passes (zero errors).
- [x] `npm test` passes (68/68).
- [x] `npm run build` produces `dist/server.js`.
- [x] `node dist/server.js` boots, emits exactly three `tool_registered` JSON lines on stderr, zero bytes on stdout.
- [x] Three tools registered: `read_mcp_execution_spec`, `validate_mcp_execution_spec`, `summarize_mcp_execution_spec`. Descriptions all start with `[read-only]` and pass `assertSafeToolMetadata`.
- [x] `validate_mcp_execution_spec` on `valid-web-dry-run.yaml` returns `{ok: true, errors: []}`.
- [x] `validate_mcp_execution_spec` on each of the five invalid fixtures returns the expected error code.

### Current accuracy

The plan accurately describes the M0–M3 work that shipped. The §File Structure and §Milestones 4–8 sections describe **planned** work and are unchanged — they remain the source of truth for the next pass. The three decisions above (schema flexibility, TS version pin, fixture coverage) are local refinements; the overall architecture, error taxonomy, safety posture, and tool surface are unchanged.

### Verification commands run (reproducible)

```
git checkout feat/m0-m3-validator-slice
npm install
npm test            # → 68 passing
npm run typecheck   # → no errors
npm run build       # → dist/ populated
timeout 1 node dist/server.js < /dev/null   # → 3 stderr lines, 0 stdout, exit 0 or 124
```

End-to-end fixture verification (run from project root after `npm run build`):

```
cat > .smoke.mjs <<'EOF'
import { readSpec } from "./dist/spec/readSpec.js";
import { validateSpec } from "./dist/spec/validateSpec.js";
for (const f of ["valid-web-dry-run","invalid-ua-fields","invalid-secret-in-spec","invalid-high-card-cd","invalid-per-event-tag","invalid-consent-change"]) {
  try { const r = validateSpec(await readSpec(`tests/fixtures/specs/${f}.yaml`)); console.log(f, r.ok ? "OK" : r.errors.map(e=>e.code)); }
  catch (e) { console.log(f, "threw", e.code); }
}
EOF
node .smoke.mjs && rm .smoke.mjs
```

Expected output (already confirmed):

```
valid-web-dry-run OK
invalid-ua-fields [ 'SPEC_INVALID' ]
invalid-secret-in-spec [ 'SECRET_DETECTED' ]
invalid-high-card-cd [ 'PII_DETECTED' ]
invalid-per-event-tag [ 'SPEC_INVALID' ]
invalid-consent-change [ 'CONSENT_CHANGE_BLOCKED' ]
```

---

## Slice 2 outcome — M4 Google API clients (2026-05-28)

**Status:** Shipped on `feat/m0-m3-validator-slice` (branch kept; commits append). M5 next.

### What landed

4 tasks, 4 commits (one per task). `googleapis@172.0.0` added as a pinned runtime dep.

| Task | Files (src) | Files (tests) | Net tests |
|------|-------------|---------------|-----------|
| 4.1 auth | `src/auth/{scopes,googleAuth}.ts` | `tests/auth.test.ts` | +7 |
| 4.2 ga4 client | `src/ga4/{capabilities,adminClient}.ts` | `tests/ga4.capabilities.test.ts` | +4 |
| 4.3 ga4 readers | `src/ga4/{properties,streams,customDimensions,customMetrics,keyEvents,measurementProtocolSecrets}.ts` | `tests/ga4.measurementProtocolSecrets.test.ts` | +3 |
| 4.4 gtm client + readers | `src/gtm/{tagManagerClient,accounts,containers,workspaces,builtInVariables,variables,triggers,tags}.ts` | `tests/gtm.workspaces.test.ts` | +4 |

Final: **86 tests passing, 22 test files.** `npm test`, `typecheck`, `build` all clean.

### Safety contracts enforced in this slice

- **`buildAuth({mode:"publish"})` refuses unless `INCLUDE_PUBLISH_SCOPE=1`** in env. The publish OAuth scope cannot even be requested without explicit opt-in, completely independent of per-call approval tokens.
- **`measurementProtocolSecrets.listMetadata` strips `secretValue` from every response entry** before returning, via the exported `stripSecretValue` helper. Even if a future GA Admin API change starts returning secret values on list, they are dropped at the wrapper boundary. Two tests pin this.
- **`workspaceCapacity` integrates with M3's `checkCapacity`** — single source of truth for the 3-workspace-per-container GTM cap. Returns `{existing, max, freeSlots, capacityOk}`.
- **`capabilityOf(op)`** returns `"unsupported"` for any unknown op via `?? "unsupported"`. `archive_custom_dimension` is explicitly listed as `unsupported` (never silently degraded).

### Deferred to M5+

- `versions.ts` (create_version — REMOVES workspace; M6 with hard gate).
- `preview.ts` (manual checklist; M6).
- `publish.ts` (M6 with INCLUDE_PUBLISH_SCOPE runtime check on top of scope gate).
- Upsert helpers for tags/triggers/variables/built-in vars/CDs/CMs/key events (M6).
- State normalization + diff engine (M5).

### Verification (this milestone)

```
npm install            # adds googleapis 172.0.0 from package-lock
npm test               # → 86 passing
npm run typecheck      # → no errors
npm run build          # → dist/ populated
```

---

## Slice 3 outcome — M5 diff engine (2026-05-28)

**Status:** Shipped on `feat/m0-m3-validator-slice`. M6 next.

### What landed

4 tasks, 4 commits. Pure-function planner layer — no I/O, no network, no env.

| Task | Files (src) | Tests | Net tests |
|------|-------------|-------|-----------|
| 5.1 desiredState | `src/planner/desiredState.ts` | `tests/planner.desiredState.test.ts` | +2 |
| 5.2 currentState | `src/planner/currentState.ts` | `tests/planner.currentState.test.ts` | +2 |
| 5.3 diff         | `src/planner/diff.ts` | `tests/diff.test.ts` | +5 |
| 5.4 GTM payloads | `src/planner/desiredState.ts` (helpers added) | `tests/gtmPayloads.test.ts` | +3 |

Final: **98 tests passing, 26 test files.** Clean build, clean typecheck.

### Canonical internal model

Shared by `desiredState`, `currentState`, `diff` — defined once in `desiredState.ts`, re-imported elsewhere:

```ts
NormalizedState = { ga4: { customDimensions, customMetrics, keyEvents }, gtm: { builtInVariables, variables, triggers, tags } }
```

Every entity is `{kind, name, config}`. `name` is the identity key; `config` is compared via `stableStringify`. All arrays sorted alphabetically by `name` so diff output is byte-stable across runs.

### Diff classification rules

- Missing in current → `create`
- Identical `stableStringify(config)` → `unchanged`
- Different `config` → `update` (records `before` + `after`)
- Current-only entities are NOT classified as `delete` here — deletes are only valid when explicitly requested, and the destructive guard from M3 handles them at apply-time.
- `skipped` / `blocked` lists stay empty in this layer; the M6 apply orchestrator populates them when a guard blocks an otherwise-classified entity. `warnings` likewise empty.

### Known normalization gaps (refine in M6 as real data shows up)

These were called out by the implementing subagent. They are acceptable for M5 (diff output is still deterministic and useful) but worth a follow-up pass once the apply orchestrator can resolve trigger IDs:

1. **GTM trigger `eventName` is absent in normalized current state.** Real GTM API triggers carry the event name inside `customEventFilter` rather than at the top level. Until the parser is enriched, desired-vs-current triggers will diff as `update` even when logically identical.
2. **GTM tag `trigger` field is empty string in normalized current state.** GTM returns numeric `firingTriggerId` arrays, not the human-readable trigger names used in specs. ID→name resolution belongs to the apply orchestrator in M6.
3. **Trigger type case mismatch.** Spec uses `custom_event` (snake_case); GTM API uses `customEvent` (camelCase). `currentState` keeps the GTM representation as-is. The `TRIGGER_TYPE_MAP` reverse mapping is the M6 fix.

Net effect: in M5 the diff over-reports `update` for GTM triggers and tags. The deterministic comparison and `create`/`unchanged` paths are unaffected. M6 will tighten this when it resolves trigger IDs.

### GTM payload helpers shipped (used by M6 apply)

- `desiredVariableToGtmPayload(v)` → `{name, type: "v", parameter: [{name}, {dataLayerVersion}]}`
- `desiredTriggerToGtmPayload(t)` → maps `custom_event` → `customEvent`, expands filters to `customEventFilter` with `arg0`/`arg1` parameters
- `desiredTagToGtmPayload(tg)` → `{name, type, parameter: [{eventName}, {measurementId}?, ...{params}], firingTriggerId: [trigger]}`

### Verification (this milestone)

```
npm test               # → 98 passing
npm run typecheck      # → no errors
npm run build          # → dist/ populated
```

---

## Slice 4 outcome — M6 apply engine (2026-05-28)

**Status:** Shipped on `feat/m0-m3-validator-slice`. M7 next.

### What landed

6 tasks, 6 commits.

| Task | Files (src) | Tests | Net tests |
|------|-------------|-------|-----------|
| 6.4 versions | `src/gtm/versions.ts` | `tests/gtm.versions.test.ts` | +2 |
| 6.5 preview | `src/gtm/preview.ts` | `tests/gtm.preview.test.ts` | +2 |
| 6.6 publish | `src/gtm/publish.ts` | `tests/gtm.publish.test.ts` | +2 |
| 6.2 GTM upserts | `src/gtm/upsertResult.ts` + additions to `{builtInVariables,variables,triggers,tags}.ts` | `tests/gtm.upserts.test.ts` | +5 |
| 6.3 GA4 upserts | additions to `src/ga4/{customDimensions,customMetrics,keyEvents}.ts` | `tests/ga4.upserts.test.ts` | +6 |
| 6.1 applyPlan | `src/planner/applyPlan.ts` | `tests/planner.applyPlan.test.ts` | +5 |

Final: **120 tests passing, 32 test files.** Clean typecheck, clean build.

### Safety contracts enforced

- **`createVersion` refuses `workspaceId === "0"`** before touching the API. `workspaces.create_version` REMOVES the workspace — running it against the live workspace would be catastrophic. Test pins the refusal AND that no API call is made.
- **`publishVersion` refuses unless `INCLUDE_PUBLISH_SCOPE=1`** at runtime, on top of the same env check `buildAuth` enforces at scope-construction time. Two defense layers. Test pins both that the API isn't called when the env isn't set AND that it IS called when the env is set.
- **`getPreviewInfo` only calls `workspaces.get`** — never `create_version`, never `publish`. Test confirms by spying on every method.
- **`applyPlan` with `dryRun: true` makes ZERO writer calls.** Test pins `callsMade === 0` AND the spy's `calls` array stays empty. Every `create`/`update` entry becomes `skipped`.
- **`upsertCustomDimension` throws `API_UNSUPPORTED` rather than attempting to mutate immutable fields** (`parameterName`, `scope`). GA Admin does not allow changing them; the upsert surfaces a clear error instead of an API failure.
- **No `archive*` functions are exported anywhere** in `src/ga4/`. The test for `keyEvents` pins this; manual check confirms `customDimensions.ts` and `customMetrics.ts` do not expose archive either.

### Architecture: applyPlan as a pure dispatcher

`applyPlan` is intentionally a thin dispatcher:

- It does NOT consult M3 safety guards (destructive, consent). The M7 tool wrapper runs those on the diff BEFORE handing it to `applyPlan`.
- It does NOT call `audit()` itself. M7 owns the audit boundary so callers know whether this was a GA4 apply or a GTM apply.
- It accepts a `Writers` dependency interface so tests can swap in spies. M7 will partially-apply the real Google clients when constructing the `writers` object so the orchestrator doesn't have to thread them.

This separation keeps `applyPlan` testable as a pure function of `(diff, dryRun, writers, currentRaw) → ApplyPlanResult`.

### `ApplyPlanResult` shape

```ts
{
  applied: number,         // entities written successfully
  skipped: number,         // would-be writes that didn't run (dry_run or already-skipped)
  blocked: number,         // unknown kinds, throws from writers
  unchanged: number,       // no-op (already correct)
  callsMade: number,       // total writer invocations (==0 under dry_run)
  details: Array<{ kind, name, outcome: "applied"|"skipped"|"blocked"|"unchanged", reason? }>
}
```

`details` preserves input order so the summary is deterministic across runs with the same diff.

### Verification (this milestone)

```
npm test               # → 120 passing
npm run typecheck      # → no errors
npm run build          # → dist/ populated
```

---

## Slice 5 outcome — M7 MCP tools surface (2026-05-28)

**Status:** Shipped on `feat/m0-m3-validator-slice`. M8 next.

### What landed

8 tasks, 8 commits. All twelve MCP tools wired and verified live.

| Task | Files | Tests | Net tests |
|------|-------|-------|-----------|
| 7.1 read tools (ga4/gtm state) | `src/tools/readTools.ts` (extended) | — | 0 |
| 7.3 diff tool | `src/tools/diffTools.ts` | — | 0 |
| 7.4 apply tools | `src/tools/applyTools.ts` | — | 0 |
| 7.5 preview tool | `src/tools/previewTools.ts` | — | 0 |
| 7.6 version gated tool | `src/tools/versionTools.ts` | — | 0 |
| 7.7 publish gated tool | `src/tools/publishTools.ts` | — | 0 |
| 7.8 server wire + boot test | `src/server.ts` (rewritten), `tests/server.boot.test.ts` (updated) | reorganized | 0 (net) |
| 7.9 live metadata test | `tests/toolMetadataGuards.test.ts` (appended) | new block | +3 |

Final: **123 tests passing, 32 test files.** Clean typecheck, clean build.

### Live tool set (12 tools)

Verified via `buildServer()` import + `assertSafeToolMetadata` at boot:

| Tool | Label | hasApprovalToken |
|------|-------|------------------|
| `read_mcp_execution_spec` | `[read-only]` | false |
| `validate_mcp_execution_spec` | `[read-only]` | false |
| `summarize_mcp_execution_spec` | `[read-only]` | false |
| `read_ga4_state` | `[read-only]` | false |
| `read_gtm_state` | `[read-only]` | false |
| `diff_ga4_gtm_state` | `[read-only]` | false |
| `create_gtm_workspace` | `[write — non-live workspace only]` | false |
| `apply_gtm_workspace_changes` | `[dry-run-capable write]` | false |
| `apply_ga4_admin_changes` | `[dry-run-capable write]` | false |
| `get_gtm_preview_info` | `[read-only]` | false |
| `create_gtm_container_version_gated` | `[gated dangerous]` | **true** |
| `publish_gtm_version_gated` | `[gated dangerous]` | **true** |

Only the two `_gated` tools require `approval_token` in their Zod input schema. Live metadata test (7.9) imports `buildServer` and runs the guard against the actual registered set so a future regression in any tool's description is caught at `npm test`.

### Apply path threading (M7.4)

Both apply tools follow the same defensive shape:

1. `readSpec` (M2) — fails fast on bad YAML / schema.
2. `validateSpec` (M2) — fails on UA fields, secrets, high-card dims, per-event-tag explosion, missing target IDs, consent guard.
3. `gateConsentChange` (M3) — runs again at apply boundary (defense in depth).
4. `assertWorkspaceSafe` / `workspace_id === "0"` rejection (M3 + tool layer).
5. Read current state from GA4/GTM (M4 wrappers).
6. `toDesiredState` + `toCurrentState` + `diffStates` (M5).
7. `findDestructiveChanges` (M3) on the diff — refuses deletes/archives unless explicitly approved.
8. `applyPlan` (M6) with the appropriate `Writers` adapters. `dry_run: true` by default → zero writer calls.
9. `audit("gtm_apply_summary"|"ga4_apply_summary", ...)` records the result.

The GA4 apply tool sets every GTM writer in its `Writers` object to a no-op `{action: "unchanged"}` (and vice versa for the GTM apply tool). This is the cheapest way to scope `applyPlan`'s dispatcher to one domain at a time without forking the orchestrator.

### Gated tools (M7.6 + M7.7)

Both gated tools follow the same pattern:

1. Load spec.
2. Call the corresponding M3 gate (`gateVersionCreation` / `gatePublish`) with EVERY required field.
3. If gate returns `{ok: false}`, audit `version_blocked` / `publish_blocked` with all reasons, throw `MCPError`.
4. If gate passes, build the appropriate auth-scoped client and call the underlying M6 wrapper (`createVersion` / `publishVersion`). Those wrappers add their OWN safety checks (workspace ID != 0 for version, `INCLUDE_PUBLISH_SCOPE=1` env for publish) — defense in depth.
5. On success, audit `version_created` / `publish_succeeded` and return the result + the manual validation checklist (for version creation).

### Preview tool (M7.5) — graceful API-failure path

If GTM API auth isn't configured, `get_gtm_preview_info` does NOT crash — it returns the manual validation checklist alone with a `note` field explaining the API call failed. This is deliberate: operators can still see "here's what to verify by hand" even without API access, and fabricating a preview URL would be worse than honest "no API available."

### Verification (this milestone)

```
npm test               # → 123 passing
npm run typecheck      # → no errors
npm run build          # → dist/ populated
```

Live tool surface verified:

```
node -e "import('./dist/server.js').then(m => { const {tools}=m.buildServer(); console.log(tools.length); })"
# → 12
```

---

## Slice 6 outcome — M8 examples, README, polish (2026-05-28)

**Status:** Shipped. This completes the plan; all milestones M0–M8 are done.

### What landed

| Task | File | Action |
|------|------|--------|
| 8.1 | `examples/mcp-execution.example.yaml` | Already present from a prior step; verified placeholder-safe and that it passes `validate_mcp_execution_spec` (`ok:true`). |
| 8.1 | `.env.example` | Created. Documents only the env vars the code actually reads. |
| 8.2 | `README.md` | Full rewrite (was an 11-line scaffolding stub): does/does-not, planner relationship, install, auth + scopes + publish opt-in, local run, MCP client config, the 12 tools, five workflows, every safety guard, known limitations, troubleshooting. |
| 8.3 | `AGENTS.md` §10 | Corrected two stale facts (see Current Accuracy). |
| 8.3 | this plan | Status → `executed`; top status note rewritten; "11 tools" → "12"; M8 + acceptance checkboxes resolved with evidence; this Outcome added; file renamed `IN-PROGRESS-*` → `EXECUTED-*`. |

### Commands run during verify

```
npm run typecheck            # exit 0
npm run build                # dist/server.js produced
npm test                     # 123 passed (123), 32 files
node dist/server.js </dev/null   # 0 stdout bytes; 12 tool_registered lines on stderr
node -e "validateSpec(readSpec('examples/mcp-execution.example.yaml'))"   # {ok:true, errors:[]}
grep credential/ID scans on README.md, .env.example, examples/   # clean
```

### Outcome meaning: Implemented with changes

The result differs from the plan's M8 sketch in three honest ways, each to keep the docs matching the code:

1. **`.env.example` documents only what is consumed.** Repo-wide, the only env var read anywhere is `INCLUDE_PUBLISH_SCOPE`; `GoogleAuth` picks up `GOOGLE_APPLICATION_CREDENTIALS` implicitly. The plan's sketch also listed an OAuth refresh-token path and `GA4_PROPERTY_ID`/`GTM_*` vars — none are read by any code (`src/auth/googleAuth.ts:19-22` notes OAuth is "not constructed here"). Documenting them would describe behavior that does not exist, so they are omitted with an explanatory comment. Target IDs are passed as explicit tool arguments.
2. **The tool surface is 12, not 11.** The plan's prose said "11 tools" in two places; the implemented and live-verified surface is 12 (the M7 slice shipped both `read_ga4_state` and `read_gtm_state` plus the rest). Corrected in this file and the README.
3. **README known-limitations are stated honestly**, including that OAuth auth is not yet wired and that the diff currently over-reports `update` for GTM triggers/tags (the M5 normalization gap), rather than implying a cleaner state than the code delivers.

### Doc Review Criteria checked (per `docs/AGENTS.md`)

`README.md` and `.env.example` are user-facing docs, so they were reviewed against the four dimensions:

- **UI/UX wording & flow** — checked. Plain-language tool table and five end-to-end workflows; every error code in the troubleshooting section names the cause and the operator's next step.
- **Backend/API correctness** — checked. Tool labels/summaries are the verbatim `description` strings from `src/tools/*`; scopes match `src/auth/scopes.ts`; the auth section states the service-account path is the only wired one; the example config reflects the real `dist/server.js` stdio entrypoint.
- **Security & privacy** — checked. No secrets/tokens/real IDs in any shipped doc (scans clean); publish opt-in (`INCLUDE_PUBLISH_SCOPE=1`), the secret/PII guards, MP-secret handling, and the redacted audit log are all documented; `.env.example` carries placeholders only.
- **Architecture & contracts** — checked. The planner-vs-executor boundary, the 12-tool contract with safety labels, the dry-run default, and the hard gates are documented as contracts. **Deferred finding:** the M5 trigger/tag normalization gap is documented as a known limitation rather than fixed (out of M8 scope; tracked in the §Slice 3 outcome).

### Not done in this pass

- **No git commit.** All M8 changes are staged in the working tree but uncommitted, pending the user's go-ahead on whether to land them as one `docs:` commit or as the plan's three separate commits (8.1 / 8.2 / 8.3). The three "Commit" steps in M8 remain unchecked above for this reason.

---

## Current Accuracy

**Accurate as of 2026-05-28.** Shipped code, tests, and `README.md` are now the source of truth; this artifact is historical context.

- The §Milestones, §File Structure, §Error Codes, and §Audit Log sections describe what shipped and remain accurate, with these noted refinements captured in the slice outcomes: `Tag.type` is a free `z.string()`, the MP-secret `action` accepts the planner's `manual_create_or_mcp_create_placeholder` literal, TypeScript is pinned to 5.9.3, and the two synthetic-input gate fixtures were tested inline rather than as YAML files.
- `AGENTS.md` §10 previously stated `googleapis` was "intentionally NOT a dependency" and listed only four `src/` subdirs — both were left over from the M0–M3 slice and are now corrected (`googleapis@172.0.0` is a listed core dep; all eight subdirs are listed).
- The "11 tools" figure that appeared in the §File Structure table and the original acceptance list was wrong; the real surface is 12 and is corrected throughout.
- Known limitation still open: the diff over-reports `update` for GTM triggers and tags until trigger ID→name resolution lands (see §Slice 3 outcome). Documented in the README.
