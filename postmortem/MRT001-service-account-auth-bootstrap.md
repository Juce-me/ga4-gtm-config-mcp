# Postmortem MRT001: service-account-auth-bootstrap

**Date**: 2026-05-29
**Severity**: High
**Status**: Resolved
**Author**: a.feygin

## Summary

The original authorization setup said the MCP runtime should use Application Default Credentials from a service-account JSON key, and that the service-account identity must have GA4 Admin and GTM Edit access. That guidance skipped the hard part: GA4/GTM UI access-management flows are user-account oriented and are not a reliable way to add `*.iam.gserviceaccount.com` identities.

The result was a setup path that looked secure and plausible but was not operationally usable for the intended service-account-only MCP runtime.

## Impact

- First-time setup for service-account MCP runtime was blocked.
- Operators could be pushed toward the wrong workaround: running the MCP with a human OAuth refresh token.
- The README implied a complete service-account path while omitting the required product-access bootstrap.
- No live GA4/GTM resources were modified by the bad guidance in this repo.

## Root Cause

The implementation conflated three different authorization layers:

1. Google Cloud service-account identity creation.
2. OAuth credential acquisition for calling Google APIs.
3. Product-level GA4/GTM access grants.

The previous docs validated layer 1 and layer 2 but assumed layer 3 could be solved manually in the product UIs. That assumption was wrong:

- GA4 Help says UI user addition expects a Google Account or Google Workspace Account email.
- GTM Help says access can only be delegated to Google accounts and invitations are sent to users.
- Service accounts can authenticate to APIs, but they are not interactive Google users and cannot accept GTM invitations.

The supported path is to bootstrap product-level access through the official user-management APIs:

- GA4 Admin API `properties.accessBindings.create` / `accounts.accessBindings.create` with `analytics.manage.users`.
- GTM API `accounts.user_permissions.create` with `tagmanager.manage.users`.

## Timeline

- 2026-05-28: Initial MCP server shipped with service-account/ADC runtime auth and README language stating the service account must already have GA4/GTM access.
- 2026-05-29: User reported the service account could not be added as a GTM/Analytics user through the described path.
- 2026-05-29: Research verified the UI limitation and the API-based bootstrap path.
- 2026-05-29: Implementation added runtime credential-source rejection for `authorized_user` ADC, bootstrap-only scopes, GA4/GTM access bootstrap helpers, one-time bootstrap CLI, and corrected setup docs.
- 2026-05-29: Review found and fixed metadata ADC fallback, unsupported GA4 `updateMask`, conflicting CLI flags, and missing pagination in access lookup.

## Resolution

The auth model was split into two explicit flows:

- Runtime MCP auth: service-account JSON, external-account/WIF JSON, or explicit metadata-server service identity only. Human `authorized_user` ADC is rejected.
- One-time bootstrap auth: a human admin provides a short-lived OAuth access token with `analytics.manage.users` and `tagmanager.manage.users` to grant the service account product-level GA4/GTM access.

Implemented files:

- `src/auth/credentialSource.ts`
- `src/auth/googleAuth.ts`
- `src/auth/scopes.ts`
- `src/bootstrap/accessBootstrap.ts`
- `src/cli/bootstrapAccess.ts`
- `README.md`
- `.env.example`
- `docs/agents/bugfixes/EXECUTED-2026-05-29-service-account-bootstrap-auth.md`

## Verification

Local verification passed:

- `npm run typecheck`
- `npm test` -> 40 files, 178 tests
- `npm run build`
- `git diff --check`

The implementation also added regression tests for:

- rejecting `authorized_user` ADC credentials;
- forcing metadata auth through an explicit `Compute` client;
- keeping user-management scopes out of runtime scope tiers;
- GA4/GTM bootstrap create/update/noop behavior;
- GA4/GTM paginated access lookup;
- dry-run-default CLI behavior;
- rejecting conflicting `--dry-run` and `--apply`.

Live GA4/GTM mutation validation was not run because it requires disposable real resources and explicit operator approval.

## Lessons Learned

- Service-account authentication support does not imply product-level access can be granted through that product's UI.
- Product-access bootstrap must be verified against product-specific access-management docs and API docs, not inferred from Google Cloud IAM behavior.
- Setup documentation is part of the executable contract; if a first-time operator cannot follow it successfully, the implementation is incomplete.
- For security-sensitive auth paths, preventing unsafe fallback matters as much as documenting the intended path.

## Action Items

- [x] Replace service-account-only setup docs with bootstrap/runtime split.
- [x] Reject human `authorized_user` ADC at MCP runtime.
- [x] Add bootstrap-only GA4/GTM user-management scopes outside normal runtime scope tiers.
- [x] Add one-time bootstrap CLI with dry-run default.
- [x] Add tests for metadata auth, paginated user lookup, and CLI safety flags.
- [ ] Run live bootstrap validation on disposable GA4/GTM resources before calling the flow externally proven end-to-end.

## Prevention

- Before documenting auth setup, verify both identity creation and product-level access-grant mechanics.
- Do not assume Google Cloud IAM principals behave like Google Accounts inside GA4/GTM UI access-management flows.
- Keep human OAuth tokens out of MCP runtime unless the project explicitly changes its security model.
- For any future auth docs, include the exact scopes, exact API endpoint or UI path, and a verification command or manual check.

## Related Issues

- Agent bugfix artifact: `docs/agents/bugfixes/EXECUTED-2026-05-29-service-account-bootstrap-auth.md`

## References

- README auth setup: `README.md`
- Runtime credential guard: `src/auth/credentialSource.ts`
- Auth factory: `src/auth/googleAuth.ts`
- Bootstrap helpers: `src/bootstrap/accessBootstrap.ts`
- Bootstrap CLI: `src/cli/bootstrapAccess.ts`
- GA4 UI user setup: https://support.google.com/analytics/answer/9305788
- GA4 Admin access bindings: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings
- GA4 `properties.accessBindings.create`: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings/create
- GTM UI user setup: https://support.google.com/tagmanager/answer/6107011
- GTM `accounts.user_permissions.create`: https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.user_permissions/create
- GTM service-account auth docs: https://developers.google.com/tag-platform/tag-manager/api/v2/authorization
