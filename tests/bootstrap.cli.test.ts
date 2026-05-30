import { describe, expect, it } from "vitest";
import { parseBootstrapAccessArgs, runBootstrapAccess } from "../src/cli/bootstrapAccess.js";

describe("parseBootstrapAccessArgs", () => {
  it("defaults to dry run and parses GA4 plus GTM targets", () => {
    expect(parseBootstrapAccessArgs([
      "--service-account-email", "svc@example.iam.gserviceaccount.com",
      "--ga4-property", "properties/123",
      "--gtm-account", "456",
      "--gtm-container", "789",
    ])).toEqual({
      serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
      ga4Property: "properties/123",
      gtmAccount: "456",
      gtmContainer: "789",
      dryRun: true,
      skipGa4: false,
      skipGtm: false,
    });
  });

  it("requires --apply before writes", () => {
    expect(parseBootstrapAccessArgs([
      "--service-account-email", "svc@example.iam.gserviceaccount.com",
      "--skip-ga4",
      "--skip-gtm",
      "--apply",
    ])).toMatchObject({ dryRun: false });
  });

  it("accepts explicit --dry-run", () => {
    expect(parseBootstrapAccessArgs([
      "--service-account-email", "svc@example.iam.gserviceaccount.com",
      "--skip-ga4",
      "--skip-gtm",
      "--dry-run",
    ])).toMatchObject({ dryRun: true });
  });

  it("rejects conflicting --dry-run and --apply flags", () => {
    expect(() => parseBootstrapAccessArgs([
      "--service-account-email", "svc@example.iam.gserviceaccount.com",
      "--skip-ga4",
      "--skip-gtm",
      "--dry-run",
      "--apply",
    ])).toThrowError(/Choose either --dry-run or --apply/);
  });

  it("requires service-account email", () => {
    expect(() => parseBootstrapAccessArgs(["--skip-ga4", "--skip-gtm"])).toThrowError(
      /Missing --service-account-email/,
    );
  });

  it("requires a GA4 property unless GA4 is skipped", () => {
    expect(() => parseBootstrapAccessArgs([
      "--service-account-email", "svc@example.iam.gserviceaccount.com",
      "--skip-gtm",
    ])).toThrowError(/Provide --ga4-property or --skip-ga4/);
  });

  it("requires both GTM account and container unless GTM is skipped", () => {
    expect(() => parseBootstrapAccessArgs([
      "--service-account-email", "svc@example.iam.gserviceaccount.com",
      "--skip-ga4",
      "--gtm-account", "456",
    ])).toThrowError(/Provide --gtm-account and --gtm-container or --skip-gtm/);
  });

  it("runs GA4 and GTM bootstrap helpers with a short-lived token", async () => {
    const calls: unknown[] = [];

    const result = await runBootstrapAccess({
      args: {
        serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
        ga4Property: "123",
        gtmAccount: "456",
        gtmContainer: "789",
        dryRun: true,
        skipGa4: false,
        skipGtm: false,
      },
      readAccessToken: async () => "fake-short-lived-token",
      makeClients: (accessToken) => {
        calls.push({ accessToken });
        return { ga4: "ga4-client", gtm: "gtm-client" };
      },
      ensureGa4: async (client, options) => {
        calls.push({ client, options });
        return { action: "create", parent: "properties/123", roles: ["predefinedRoles/editor"], dryRun: true };
      },
      ensureGtm: async (client, options) => {
        calls.push({ client, options });
        return {
          action: "create",
          parent: "accounts/456",
          containerAccess: [{ containerId: "789", permission: "edit" }],
          dryRun: true,
        };
      },
    });

    expect(result).toEqual({
      dryRun: true,
      ga4: { action: "create", parent: "properties/123", roles: ["predefinedRoles/editor"], dryRun: true },
      gtm: {
        action: "create",
        parent: "accounts/456",
        containerAccess: [{ containerId: "789", permission: "edit" }],
        dryRun: true,
      },
    });
    expect(calls).toEqual([
      { accessToken: "fake-short-lived-token" },
      {
        client: "ga4-client",
        options: {
          propertyId: "123",
          serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
          dryRun: true,
        },
      },
      {
        client: "gtm-client",
        options: {
          accountId: "456",
          containerId: "789",
          emailAddress: "svc@example.iam.gserviceaccount.com",
          dryRun: true,
        },
      },
    ]);
  });

  it("rejects an empty bootstrap access token", async () => {
    await expect(runBootstrapAccess({
      args: {
        serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
        ga4Property: "123",
        dryRun: true,
        skipGa4: false,
        skipGtm: true,
      },
      readAccessToken: async () => " ",
    })).rejects.toThrowError(/Missing bootstrap access token/);
  });
});
