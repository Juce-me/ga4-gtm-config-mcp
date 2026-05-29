import { describe, expect, it } from "vitest";
import { ensureGtmUserPermission } from "../src/bootstrap/accessBootstrap.js";

type ContainerAccess = {
  containerId?: string;
  permission?: string;
};

type UserPermission = {
  path?: string;
  emailAddress?: string;
  accountAccess?: { permission?: string };
  containerAccess?: ContainerAccess[];
};

type GtmSpy = {
  listCalls: unknown[];
  createCalls: unknown[];
  updateCalls: unknown[];
};

function fakeGtm(permissions: UserPermission[], spy: GtmSpy) {
  return fakeGtmPages([{ userPermission: permissions }], spy);
}

function fakeGtmPages(pages: Array<{ userPermission?: UserPermission[]; nextPageToken?: string }>, spy: GtmSpy) {
  return {
    accounts: {
      user_permissions: {
        list: async (args: { parent: string; pageToken?: string }) => {
          spy.listCalls.push(args);
          const index = args.pageToken ? Number(args.pageToken) : 0;
          return { data: pages[index] ?? {} };
        },
        create: async (args: unknown) => {
          spy.createCalls.push(args);
          return { data: (args as { requestBody: UserPermission }).requestBody };
        },
        update: async (args: unknown) => {
          spy.updateCalls.push(args);
          return { data: (args as { requestBody: UserPermission }).requestBody };
        },
      },
    },
  } as unknown as Parameters<typeof ensureGtmUserPermission>[0];
}

describe("GTM access bootstrap helper", () => {
  it("creates a missing user permission with default edit container access", async () => {
    const spy: GtmSpy = { listCalls: [], createCalls: [], updateCalls: [] };

    const result = await ensureGtmUserPermission(fakeGtm([], spy), {
      accountId: "1",
      containerId: "2",
      emailAddress: "svc@example.iam.gserviceaccount.com",
    });

    expect(result).toMatchObject({ action: "create", parent: "accounts/1", dryRun: false });
    expect(spy.listCalls).toEqual([{ parent: "accounts/1" }]);
    expect(spy.createCalls).toEqual([
      {
        parent: "accounts/1",
        requestBody: {
          emailAddress: "svc@example.iam.gserviceaccount.com",
          accountAccess: { permission: "user" },
          containerAccess: [{ containerId: "2", permission: "edit" }],
        },
      },
    ]);
    expect(spy.updateCalls).toEqual([]);
  });

  it("returns noop when an existing user permission already matches the requested container permission", async () => {
    const spy: GtmSpy = { listCalls: [], createCalls: [], updateCalls: [] };

    const result = await ensureGtmUserPermission(
      fakeGtm(
        [
          {
            path: "accounts/1/user_permissions/abc",
            emailAddress: "svc@example.iam.gserviceaccount.com",
            containerAccess: [{ containerId: "2", permission: "edit" }],
          },
        ],
        spy,
      ),
      {
        accountId: "accounts/1",
        containerId: "containers/2",
        emailAddress: "svc@example.iam.gserviceaccount.com",
        permission: "edit",
      },
    );

    expect(result).toMatchObject({ action: "noop", path: "accounts/1/user_permissions/abc", dryRun: false });
    expect(spy.createCalls).toEqual([]);
    expect(spy.updateCalls).toEqual([]);
  });

  it("updates an existing user permission with merged container access", async () => {
    const spy: GtmSpy = { listCalls: [], createCalls: [], updateCalls: [] };

    const result = await ensureGtmUserPermission(
      fakeGtm(
        [
          {
            path: "accounts/1/user_permissions/abc",
            emailAddress: "svc@example.iam.gserviceaccount.com",
            accountAccess: { permission: "user" },
            containerAccess: [
              { containerId: "2", permission: "read" },
              { containerId: "9", permission: "read" },
            ],
          },
        ],
        spy,
      ),
      {
        accountId: "1",
        containerId: "2",
        emailAddress: "svc@example.iam.gserviceaccount.com",
        permission: "publish",
      },
    );

    expect(result).toMatchObject({ action: "update", path: "accounts/1/user_permissions/abc", dryRun: false });
    expect(spy.createCalls).toEqual([]);
    expect(spy.updateCalls).toEqual([
      {
        path: "accounts/1/user_permissions/abc",
        requestBody: {
          path: "accounts/1/user_permissions/abc",
          emailAddress: "svc@example.iam.gserviceaccount.com",
          accountAccess: { permission: "user" },
          containerAccess: [
            { containerId: "2", permission: "publish" },
            { containerId: "9", permission: "read" },
          ],
        },
      },
    ]);
  });

  it("finds an existing user permission on a later page before deciding to create", async () => {
    const spy: GtmSpy = { listCalls: [], createCalls: [], updateCalls: [] };

    const result = await ensureGtmUserPermission(
      fakeGtmPages(
        [
          { userPermission: [], nextPageToken: "1" },
          {
            userPermission: [{
              path: "accounts/1/user_permissions/abc",
              emailAddress: "svc@example.iam.gserviceaccount.com",
              containerAccess: [{ containerId: "2", permission: "edit" }],
            }],
          },
        ],
        spy,
      ),
      {
        accountId: "1",
        containerId: "2",
        emailAddress: "svc@example.iam.gserviceaccount.com",
      },
    );

    expect(result).toMatchObject({ action: "noop", path: "accounts/1/user_permissions/abc" });
    expect(spy.listCalls).toEqual([{ parent: "accounts/1" }, { parent: "accounts/1", pageToken: "1" }]);
    expect(spy.createCalls).toEqual([]);
    expect(spy.updateCalls).toEqual([]);
  });

  it("plans create and update without writes in dry run mode", async () => {
    const createSpy: GtmSpy = { listCalls: [], createCalls: [], updateCalls: [] };
    const createResult = await ensureGtmUserPermission(fakeGtm([], createSpy), {
      accountId: "1",
      containerId: "2",
      emailAddress: "svc@example.iam.gserviceaccount.com",
      dryRun: true,
    });

    const updateSpy: GtmSpy = { listCalls: [], createCalls: [], updateCalls: [] };
    const updateResult = await ensureGtmUserPermission(
      fakeGtm(
        [{ path: "accounts/1/user_permissions/abc", emailAddress: "svc@example.iam.gserviceaccount.com", containerAccess: [{ containerId: "2", permission: "read" }] }],
        updateSpy,
      ),
      {
        accountId: "1",
        containerId: "2",
        emailAddress: "svc@example.iam.gserviceaccount.com",
        permission: "approve",
        dryRun: true,
      },
    );

    expect(createResult).toMatchObject({ action: "create", dryRun: true });
    expect(updateResult).toMatchObject({ action: "update", dryRun: true });
    expect(createSpy.createCalls).toEqual([]);
    expect(updateSpy.updateCalls).toEqual([]);
  });

  it("rejects unsupported container permissions with SPEC_INVALID", async () => {
    const spy: GtmSpy = { listCalls: [], createCalls: [], updateCalls: [] };

    await expect(
      ensureGtmUserPermission(fakeGtm([], spy), {
        accountId: "1",
        containerId: "2",
        emailAddress: "svc@example.iam.gserviceaccount.com",
        permission: "delete",
      }),
    ).rejects.toMatchObject({ code: "SPEC_INVALID" });

    expect(spy.listCalls).toEqual([]);
    expect(spy.createCalls).toEqual([]);
    expect(spy.updateCalls).toEqual([]);
  });
});
