# OAuth Client Acquisition and Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: executed
Type: feature
Author: Juce

**Goal:** Create the operator-approved acquisition-only Desktop OAuth client and add a placeholder-only client-file example plus secure usage instructions to the repository.

**Architecture:** Google Cloud Console owns the real persistent OAuth client and its downloaded secret-bearing JSON, which remains outside Git. The repository contains only a representative placeholder file, ignore rules for likely real downloads, and documentation that passes the real file to gcloud during ADC acquisition without treating it as runtime credentials.

**Tech Stack:** Google Auth Platform, gcloud ADC login, JSON, Markdown, Git ignore rules, Node.js/npm verification.

**Source design:** [EXECUTED-2026-09-01-oauth-client-example-design.md](EXECUTED-2026-09-01-oauth-client-example-design.md)

**Commit policy:** Do not commit or push unless the user explicitly requests it after verification.

---

### Task 1: Inspect and Prepare the Google OAuth Client

**External scope:**
- Google Cloud project already approved by the operator
- Google Auth Platform audience and client pages

- [x] **Step 1: Open the approved project without changing state**

Open Google Cloud Console directly to Google Auth Platform for the approved project. Verify the selected project by its visible project name and inspect the current Overview, Audience, and Clients pages.

Expected: the project is active; no client is created or changed during inspection.

- [x] **Step 2: Check for an existing equivalent client**

Search the visible client list for application type **Desktop app** and display name `ga4-gtm-config-mcp`.

Expected: if an equivalent client already exists, stop before creating a duplicate and use its download action after confirming it is the intended credential. If none exists, continue.

- [x] **Step 3: Resolve only required audience setup**

If Google requires audience configuration before client creation, inspect the available choices. Preserve the narrowest existing configuration. Do not change Internal/External audience, publishing status, or test users without the operator approving that specific choice.

Expected: the project is ready to create a Desktop client without broadening account access.

- [x] **Step 4: Prepare the client form**

Select **Create client**, choose **Desktop app**, and enter this exact display name:

```text
ga4-gtm-config-mcp
```

Stop with the completed form visible before the final create/submit action.

- [x] **Step 5: Obtain action-time confirmation**

Ask the operator to confirm creation of one persistent Desktop OAuth credential in the approved Google Cloud project. State that the credential will identify gcloud during user-ADC acquisition and that its downloaded JSON contains a client secret.

Expected: do not click the final create/submit control until the operator confirms at this point.

- [x] **Step 6: Create and verify the external credential**

After confirmation, submit once. Verify the success state shows application type **Desktop app** and display name `ga4-gtm-config-mcp`. Do not expose or copy client identifiers or secrets into chat or repository files.

Expected: exactly one intended client exists.

- [x] **Step 7: Download the real client JSON privately**

Use the Console download action. Keep the downloaded file outside the repository root and do not open or print its contents. Record only a private absolute path for the later login invocation.

Expected: a nonempty JSON file exists outside the repository; no secret field is displayed or transmitted.

### Task 2: Add a Safe Repository Example and Ignore Rules

**Files:**
- Create: `oauth-client-example.json`
- Modify: `.gitignore`

- [x] **Step 1: Add the placeholder-only example**

Create `oauth-client-example.json` with exactly:

```json
{
  "installed": {
    "client_id": "YOUR_DESKTOP_OAUTH_CLIENT_ID.apps.googleusercontent.com",
    "project_id": "YOUR_OAUTH_SETUP_PROJECT_ID",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "YOUR_DESKTOP_OAUTH_CLIENT_SECRET",
    "redirect_uris": [
      "http://localhost"
    ]
  }
}
```

- [x] **Step 2: Add narrow credential-file ignore rules**

Append this credential section to `.gitignore`:

```gitignore
# Acquisition-only Google OAuth client downloads. Track the placeholder example only.
oauth-client*.json
client_secret_*.apps.googleusercontent.com.json
!/oauth-client-example.json
```

- [x] **Step 3: Validate JSON shape and placeholders**

Run:

```bash
jq -e '
  (. | keys == ["installed"]) and
  (.installed.client_id == "YOUR_DESKTOP_OAUTH_CLIENT_ID.apps.googleusercontent.com") and
  (.installed.project_id == "YOUR_OAUTH_SETUP_PROJECT_ID") and
  (.installed.client_secret == "YOUR_DESKTOP_OAUTH_CLIENT_SECRET") and
  (.installed.redirect_uris == ["http://localhost"])
' oauth-client-example.json
```

Expected: `true` and exit code `0`.

- [x] **Step 4: Validate ignore behavior without creating secret files**

Run:

```bash
git check-ignore -q oauth-client-real.json
git check-ignore -q client_secret_example.apps.googleusercontent.com.json
git check-ignore -q oauth-client-example.json
```

Expected: the first two commands exit `0`; the example-path command exits `1`, proving it is not ignored.

### Task 3: Document the Acquisition File Correctly

**Files:**
- Modify: `README.md`
- Modify: `docs/setup/google-cloud-credentials.md`

- [x] **Step 1: Make README setup step 2 reference the example and real download**

Replace README setup step 2 with this text:

```markdown
2. Create a Google OAuth client with application type **Desktop app**, download its real JSON to a private absolute path outside every repository, and use [`oauth-client-example.json`](oauth-client-example.json) only as a reference for the expected file shape. Run `npm run login -- --client-id-file=/absolute/path/to/oauth-client.json` and keep it active while browser authorization completes. The real client file is used only by gcloud during acquisition and must not be assigned to `GOOGLE_APPLICATION_CREDENTIALS`. Bare `npm run login` uses gcloud's built-in client; Google may reject its custom Analytics scopes.
```

- [x] **Step 2: Add a focused README security note**

Immediately after the short setup list, add:

```markdown
The tracked OAuth client example contains placeholders only. Do not replace those placeholders in Git, copy a downloaded client JSON into this repository, or configure a client-ID file as ADC. `GOOGLE_APPLICATION_CREDENTIALS` accepts an ADC credential file, not an OAuth client-ID download.
```

- [x] **Step 3: Cross-link the example from the focused credentials guide**

Replace step 3 under `docs/setup/google-cloud-credentials.md` → **Supported local user-ADC acquisition** with:

```markdown
3. Download the real client JSON to a private absolute path outside every repository. Use the tracked [`oauth-client-example.json`](../../oauth-client-example.json) only to recognize the expected JSON shape; never fill its placeholders with real values.
```

Add this sentence after the existing paragraph about the client JSON:

```markdown
The client-ID download is an acquisition input, not ADC; never assign its path to `GOOGLE_APPLICATION_CREDENTIALS`.
```

- [x] **Step 4: Review documentation correctness and security**

Confirm:

```text
UI/UX wording and flow: the first-time create, download, and login sequence is end-to-end.
Backend/API correctness: the client file is passed only through --client-id-file; runtime ADC behavior is unchanged.
Security/privacy: examples contain placeholders only and real files are directed outside Git.
Architecture/contracts: OAuth client acquisition remains separate from ADC runtime discovery.
Accessibility: not applicable; no UI or media artifact is shipped.
```

### Task 4: Verify the Repository and External Result

**Files:**
- Modify after verification: `docs/agents/features/EXECUTED-2026-09-01-oauth-client-example-design.md`
- Modify after verification: `docs/agents/features/EXECUTED-2026-09-01-oauth-client-example-implementation.md`
- Rename after verification: both artifacts from `IN-PROGRESS-*` to `EXECUTED-*`

- [x] **Step 1: Run project verification**

Run separately:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: every command exits `0`.

- [x] **Step 2: Scan changed content for forbidden real values**

Run:

```bash
git diff -- .gitignore README.md docs/setup/google-cloud-credentials.md oauth-client-example.json docs/agents/features
git diff --no-index /dev/null oauth-client-example.json
rg -n "[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com|GOCSPX-|@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|/Users/|properties/[0-9]+|accounts/[0-9]+|GTM-[A-Z0-9]+" .gitignore README.md docs/setup/google-cloud-credentials.md oauth-client-example.json docs/agents/features/EXECUTED-2026-09-01-oauth-client-example-*.md
```

Expected: no real Google client ID, `GOCSPX-` secret, user email, private machine path, GA4/GTM resource identifier, or public GTM container ID appears. Inspect tracked and untracked changes separately to confirm all repository references are relative and all example private paths use `/absolute/path/...` placeholders.

- [x] **Step 3: Verify the external file without reading secrets**

Use filesystem metadata only to confirm the downloaded real file is a regular, nonempty file outside the repository. Do not print its filename if Google embedded the client ID, and do not parse or display its JSON fields.

Expected: private file exists outside Git and the external Console client remains a Desktop app named `ga4-gtm-config-mcp`.

- [x] **Step 4: Finalize artifacts**

Rename both artifacts to `EXECUTED-2026-09-01-oauth-client-example-*.md`, change `Status: executed`, and add:

```markdown
## Outcome

Implemented as planned. The implementation is now the source of truth.

## Current Accuracy

Accurate as of execution. UI/UX wording and flow, backend/API correctness, security/privacy, and architecture/contracts were reviewed with no deferred findings. Accessibility was not applicable because no UI or media changed.
```

If execution differs, use `Implemented with changes` and describe the exact divergence.

- [x] **Step 5: Report without committing**

Report the external client type/name, whether the private download exists outside Git, repository files changed, and exact verification results. Do not report the real client ID, client secret, downloaded filename, or private path. Leave changes uncommitted until explicitly authorized.

## Outcome

Implemented with changes. The operator created and supplied a valid private Desktop OAuth client under an existing display name rather than the planned name. The JSON remained outside Git and successfully acquired standard ADC. The placeholder example, repository-wide ignore rules, README guidance, and focused credential guide were implemented. The implementation is now the source of truth.

## Current Accuracy

Partially accurate: all repository steps, verification commands, security boundaries, and ADC runtime behavior remain accurate; the external client display name and browser handoff differed from the planned flow. UI/UX wording and flow, backend/API correctness, security/privacy, and architecture/contracts were reviewed with no deferred repository findings. Accessibility was not applicable because no UI or media changed.
