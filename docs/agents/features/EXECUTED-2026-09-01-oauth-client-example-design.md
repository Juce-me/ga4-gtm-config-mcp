# OAuth Client Acquisition and Example Design

Status: executed
Type: feature
Author: Juce

## Goal

Create an acquisition-only Google OAuth Desktop client for the ADC login flow and add a safe, runnable example of the downloaded JSON shape to the repository without committing real credentials or making the client file a runtime MCP input.

## External Resource

Create one OAuth client with application type **Desktop app** and display name `ga4-gtm-config-mcp` in the existing active Google Cloud project selected by the operator. Configure only the minimum Google Auth Platform audience state required to create and use that client.

Creating the client is a persistent external credential action. Browser preparation may proceed read-only, but the final create/submit action requires an action-time confirmation. If Google requires an audience choice or test-user configuration that cannot be inferred safely, stop and ask rather than selecting a broader audience.

Download the real client JSON to a private local path outside this repository. Do not print its client ID or client secret, paste them into conversation, or commit them. The file is passed only to:

```bash
npm run login -- --client-id-file=/absolute/path/to/oauth-client.json
```

The runtime MCP server continues to use only the ADC produced by gcloud.

## Repository Example

Add `oauth-client-example.json` at the repository root using Google's Desktop-client `installed` shape and unmistakable placeholders:

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

This example documents the acquisition-file shape only. It must never be presented as ADC or assigned to `GOOGLE_APPLICATION_CREDENTIALS`.

Update `.gitignore` to reject likely real OAuth client downloads while explicitly allowing `oauth-client-example.json`. The ignore rule must cover the recommended private copy name and Google's downloaded client filename pattern without accidentally ignoring the tracked example.

## Documentation

Update `README.md` to:

1. Link `oauth-client-example.json` as a shape reference.
2. Explain that operators create and download a real Desktop OAuth client from Google Cloud Console rather than replacing placeholders in the tracked example.
3. Require storing the real JSON outside the repository at a private absolute path.
4. Show the supported `npm run login -- --client-id-file=/absolute/path/to/oauth-client.json` command.
5. State that the client file is an acquisition-only gcloud input, is not ADC, and must not be configured as `GOOGLE_APPLICATION_CREDENTIALS`.

Update `docs/setup/google-cloud-credentials.md` only where needed to cross-link the example and repeat the copy-versus-reference distinction. Do not duplicate the whole README flow.

## Files in Scope

- Create `oauth-client-example.json`.
- Modify `.gitignore`.
- Modify `README.md`.
- Modify `docs/setup/google-cloud-credentials.md`.
- Create and finalize the required feature implementation artifact.
- Create the external Google OAuth Desktop client and download its real JSON outside the repository.

## Forbidden Regressions

- Do not commit or display the real client ID, client secret, operator email, Cloud project ID, downloaded filename, or private machine path.
- Do not put the real client JSON anywhere inside the repository, including ignored directories.
- Do not describe the OAuth client JSON as runtime credentials or ADC.
- Do not change `GOOGLE_APPLICATION_CREDENTIALS`, runtime scope selection, publish gating, GA4/GTM permissions, or desired-state execution behavior.
- Do not broaden the Google Auth Platform audience beyond what the operator approves.

## Verification

- Parse `oauth-client-example.json` as JSON and assert its top-level key is `installed`.
- Confirm every mutable identifier or secret field contains an explicit placeholder.
- Use `git check-ignore` to prove representative real-client filenames are ignored and `oauth-client-example.json` is not ignored.
- Search the diff for Google client IDs, client-secret values, production identifiers, user emails, and machine paths.
- Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- Confirm the created external client is a Desktop client and that the downloaded real file exists outside the repository without reading or printing its secret fields.

## Acceptance Criteria

- A Desktop OAuth client named `ga4-gtm-config-mcp` exists in the operator-approved Google Cloud project.
- Its real JSON is downloaded privately outside Git and can be supplied to the supported npm login command.
- The tracked example is valid JSON, structurally representative, and contains placeholders only.
- README and focused setup documentation make the secure acquisition flow unambiguous.
- Real OAuth client downloads are ignored while the example remains tracked.
- All automated verification passes and no runtime authentication behavior changes.

## Outcome

Implemented with changes. The operator reused a valid Desktop OAuth client under an existing display name instead of creating the planned `ga4-gtm-config-mcp`-named client. Its private JSON remained outside the repository and successfully acquired standard user ADC. The repository example, ignore rules, and documentation were implemented as designed. The implementation is now the source of truth.

## Current Accuracy

Partially accurate: the acquisition architecture, security requirements, repository files, and verification remain accurate; only the intended external client display name differs. UI/UX wording and flow, backend/API correctness, security/privacy, and architecture/contracts were reviewed. Accessibility was not applicable because no UI or media artifact is shipped.
