import { describe, expect, it } from "vitest";
import { ensureGa4AccessBinding } from "../src/bootstrap/accessBootstrap.js";

type Ga4AccessBinding = {
  name?: string;
  user?: string;
  roles?: string[];
};

type Ga4Spy = {
  listCalls: unknown[];
  createCalls: unknown[];
  patchCalls: unknown[];
};

function fakeGa4(bindings: Ga4AccessBinding[], spy: Ga4Spy) {
  return fakeGa4Pages([{ accessBindings: bindings }], spy);
}

function fakeGa4Pages(pages: Array<{ accessBindings?: Ga4AccessBinding[]; nextPageToken?: string }>, spy: Ga4Spy) {
  return {
    properties: {
      accessBindings: {
        list: async (args: { parent: string; pageToken?: string }) => {
          spy.listCalls.push(args);
          const index = args.pageToken ? Number(args.pageToken) : 0;
          return { data: pages[index] ?? {} };
        },
        create: async (args: unknown) => {
          spy.createCalls.push(args);
          return { data: (args as { requestBody: Ga4AccessBinding }).requestBody };
        },
        patch: async (args: unknown) => {
          spy.patchCalls.push(args);
          return { data: (args as { requestBody: Ga4AccessBinding }).requestBody };
        },
      },
    },
  } as unknown as Parameters<typeof ensureGa4AccessBinding>[0];
}

describe("GA4 access bootstrap helper", () => {
  it("normalizes property IDs and creates a missing default editor binding", async () => {
    const spy: Ga4Spy = { listCalls: [], createCalls: [], patchCalls: [] };

    const result = await ensureGa4AccessBinding(fakeGa4([], spy), {
      propertyId: "123",
      serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
    });

    expect(result).toMatchObject({ action: "create", parent: "properties/123", dryRun: false });
    expect(spy.listCalls).toEqual([{ parent: "properties/123" }]);
    expect(spy.createCalls).toEqual([
      {
        parent: "properties/123",
        requestBody: {
          user: "svc@example.iam.gserviceaccount.com",
          roles: ["predefinedRoles/editor"],
        },
      },
    ]);
    expect(spy.patchCalls).toEqual([]);
  });

  it("returns noop when an existing binding has all requested roles", async () => {
    const spy: Ga4Spy = { listCalls: [], createCalls: [], patchCalls: [] };

    const result = await ensureGa4AccessBinding(
      fakeGa4(
        [
          {
            name: "properties/123/accessBindings/abc",
            user: "svc@example.iam.gserviceaccount.com",
            roles: ["predefinedRoles/viewer", "predefinedRoles/editor"],
          },
        ],
        spy,
      ),
      {
        propertyId: "properties/123",
        serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
        roles: ["predefinedRoles/editor"],
      },
    );

    expect(result).toMatchObject({ action: "noop", name: "properties/123/accessBindings/abc", dryRun: false });
    expect(spy.createCalls).toEqual([]);
    expect(spy.patchCalls).toEqual([]);
  });

  it("patches an existing binding with merged roles when a requested role is missing", async () => {
    const spy: Ga4Spy = { listCalls: [], createCalls: [], patchCalls: [] };

    const result = await ensureGa4AccessBinding(
      fakeGa4(
        [
          {
            name: "properties/123/accessBindings/abc",
            user: "svc@example.iam.gserviceaccount.com",
            roles: ["predefinedRoles/viewer"],
          },
        ],
        spy,
      ),
      {
        propertyId: "123",
        serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
        roles: ["predefinedRoles/editor"],
      },
    );

    expect(result).toMatchObject({ action: "update", name: "properties/123/accessBindings/abc", dryRun: false });
    expect(spy.createCalls).toEqual([]);
    expect(spy.patchCalls).toEqual([
      {
        name: "properties/123/accessBindings/abc",
        requestBody: {
          name: "properties/123/accessBindings/abc",
          user: "svc@example.iam.gserviceaccount.com",
          roles: ["predefinedRoles/viewer", "predefinedRoles/editor"],
        },
      },
    ]);
  });

  it("finds an existing binding on a later page before deciding to create", async () => {
    const spy: Ga4Spy = { listCalls: [], createCalls: [], patchCalls: [] };

    const result = await ensureGa4AccessBinding(
      fakeGa4Pages(
        [
          { accessBindings: [], nextPageToken: "1" },
          {
            accessBindings: [{
              name: "properties/123/accessBindings/abc",
              user: "svc@example.iam.gserviceaccount.com",
              roles: ["predefinedRoles/editor"],
            }],
          },
        ],
        spy,
      ),
      {
        propertyId: "123",
        serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
      },
    );

    expect(result).toMatchObject({ action: "noop", name: "properties/123/accessBindings/abc" });
    expect(spy.listCalls).toEqual([{ parent: "properties/123" }, { parent: "properties/123", pageToken: "1" }]);
    expect(spy.createCalls).toEqual([]);
    expect(spy.patchCalls).toEqual([]);
  });

  it("plans create and update without writes in dry run mode", async () => {
    const createSpy: Ga4Spy = { listCalls: [], createCalls: [], patchCalls: [] };
    const createResult = await ensureGa4AccessBinding(fakeGa4([], createSpy), {
      propertyId: "123",
      serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
      dryRun: true,
    });

    const updateSpy: Ga4Spy = { listCalls: [], createCalls: [], patchCalls: [] };
    const updateResult = await ensureGa4AccessBinding(
      fakeGa4(
        [{ name: "properties/123/accessBindings/abc", user: "svc@example.iam.gserviceaccount.com", roles: ["predefinedRoles/viewer"] }],
        updateSpy,
      ),
      {
        propertyId: "123",
        serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
        roles: ["predefinedRoles/editor"],
        dryRun: true,
      },
    );

    expect(createResult).toMatchObject({ action: "create", dryRun: true });
    expect(updateResult).toMatchObject({ action: "update", dryRun: true });
    expect(createSpy.createCalls).toEqual([]);
    expect(updateSpy.patchCalls).toEqual([]);
  });
});
