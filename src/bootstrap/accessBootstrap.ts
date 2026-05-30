import type { analyticsadmin_v1alpha, tagmanager_v2 } from "googleapis";
import { propertyName } from "../ga4/resourceNames.js";
import { accountId as normalizeAccountId, containerId as normalizeContainerId } from "../gtm/idPaths.js";
import { MCPError } from "../utils/errors.js";

type AccessBinding = analyticsadmin_v1alpha.Schema$GoogleAnalyticsAdminV1alphaAccessBinding;
type UserPermission = tagmanager_v2.Schema$UserPermission;
type ContainerAccess = tagmanager_v2.Schema$ContainerAccess;

type Ga4AccessClient = {
  properties: {
    accessBindings: {
      list(args: { parent: string; pageToken?: string }): Promise<{ data: { accessBindings?: AccessBinding[]; nextPageToken?: string | null } }>;
      create(args: { parent: string; requestBody: AccessBinding }): Promise<{ data: AccessBinding }>;
      patch(args: { name: string; requestBody: AccessBinding }): Promise<{ data: AccessBinding }>;
    };
  };
};

type GtmUserPermissionClient = {
  accounts: {
    user_permissions: {
      list(args: { parent: string; pageToken?: string }): Promise<{ data: { userPermission?: UserPermission[]; nextPageToken?: string | null } }>;
      create(args: { parent: string; requestBody: UserPermission }): Promise<{ data: UserPermission }>;
      update(args: { path: string; requestBody: UserPermission }): Promise<{ data: UserPermission }>;
    };
  };
};

type AccessAction = "create" | "update" | "noop";
type GtmContainerPermission = "read" | "edit" | "approve" | "publish";

export type Ga4AccessBindingResult = {
  action: AccessAction;
  parent: string;
  name?: string;
  roles: string[];
  dryRun: boolean;
  data?: AccessBinding;
};

export type GtmUserPermissionResult = {
  action: AccessAction;
  parent: string;
  path?: string;
  containerAccess: ContainerAccess[];
  dryRun: boolean;
  data?: UserPermission;
};

export async function ensureGa4AccessBinding(
  client: Ga4AccessClient,
  options: {
    propertyId: string;
    serviceAccountEmail: string;
    roles?: string[];
    dryRun?: boolean;
  },
): Promise<Ga4AccessBindingResult> {
  const parent = propertyName(options.propertyId);
  const requestedRoles = options.roles ?? ["predefinedRoles/editor"];
  const dryRun = options.dryRun ?? false;
  const bindings = await listGa4AccessBindings(client, parent);
  const existing = bindings.find((binding) => binding.user === options.serviceAccountEmail);

  if (!existing) {
    const requestBody = { user: options.serviceAccountEmail, roles: requestedRoles };
    if (dryRun) {
      return { action: "create", parent, roles: requestedRoles, dryRun };
    }
    const createRes = await client.properties.accessBindings.create({ parent, requestBody });
    return { action: "create", parent, roles: requestedRoles, dryRun, data: createRes.data };
  }

  const existingRoles = existing.roles ?? [];
  const hasAllRoles = requestedRoles.every((role) => existingRoles.includes(role));
  if (hasAllRoles) {
    return { action: "noop", parent, name: existing.name ?? undefined, roles: existingRoles, dryRun };
  }

  const mergedRoles = [...existingRoles];
  for (const role of requestedRoles) {
    if (!mergedRoles.includes(role)) {
      mergedRoles.push(role);
    }
  }
  const requestBody = { ...existing, roles: mergedRoles };

  if (dryRun) {
    return { action: "update", parent, name: existing.name ?? undefined, roles: mergedRoles, dryRun };
  }

  const name = existing.name;
  if (!name) {
    throw new MCPError("SPEC_INVALID", "Existing GA4 access binding is missing name");
  }
  const patchRes = await client.properties.accessBindings.patch({ name, requestBody });
  return { action: "update", parent, name, roles: mergedRoles, dryRun, data: patchRes.data };
}

export async function ensureGtmUserPermission(
  client: GtmUserPermissionClient,
  options: {
    accountId: string;
    containerId: string;
    emailAddress: string;
    permission?: string;
    dryRun?: boolean;
  },
): Promise<GtmUserPermissionResult> {
  const permission = assertGtmContainerPermission(options.permission ?? "edit");
  const accountId = normalizeAccountId(options.accountId);
  const containerId = normalizeContainerId(options.containerId);
  const parent = `accounts/${accountId}`;
  const dryRun = options.dryRun ?? false;
  const userPermissions = await listGtmUserPermissions(client, parent);
  const existing = userPermissions.find((userPermission) => userPermission.emailAddress === options.emailAddress);

  if (!existing) {
    const containerAccess = [{ containerId, permission }];
    const requestBody = {
      emailAddress: options.emailAddress,
      accountAccess: { permission: "user" },
      containerAccess,
    };
    if (dryRun) {
      return { action: "create", parent, containerAccess, dryRun };
    }
    const createRes = await client.accounts.user_permissions.create({ parent, requestBody });
    return { action: "create", parent, containerAccess, dryRun, data: createRes.data };
  }

  const containerAccess = existing.containerAccess ?? [];
  const existingContainerAccess = containerAccess.find((access) => access.containerId === containerId);
  if (existingContainerAccess?.permission === permission) {
    return { action: "noop", parent, path: existing.path ?? undefined, containerAccess, dryRun };
  }

  const mergedContainerAccess = existingContainerAccess
    ? containerAccess.map((access) => access.containerId === containerId ? { ...access, permission } : access)
    : [...containerAccess, { containerId, permission }];
  const requestBody = { ...existing, containerAccess: mergedContainerAccess };

  if (dryRun) {
    return { action: "update", parent, path: existing.path ?? undefined, containerAccess: mergedContainerAccess, dryRun };
  }

  const path = existing.path;
  if (!path) {
    throw new MCPError("SPEC_INVALID", "Existing GTM user permission is missing path");
  }
  const updateRes = await client.accounts.user_permissions.update({ path, requestBody });
  return { action: "update", parent, path, containerAccess: mergedContainerAccess, dryRun, data: updateRes.data };
}

function assertGtmContainerPermission(permission: string): GtmContainerPermission {
  if (permission === "read" || permission === "edit" || permission === "approve" || permission === "publish") {
    return permission;
  }
  throw new MCPError("SPEC_INVALID", "Unsupported GTM container permission", {
    permission,
    supported: ["read", "edit", "approve", "publish"],
  });
}

async function listGa4AccessBindings(client: Ga4AccessClient, parent: string): Promise<AccessBinding[]> {
  const bindings: AccessBinding[] = [];
  let pageToken: string | undefined;

  do {
    const args = pageToken ? { parent, pageToken } : { parent };
    const res = await client.properties.accessBindings.list(args);
    bindings.push(...(res.data.accessBindings ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return bindings;
}

async function listGtmUserPermissions(client: GtmUserPermissionClient, parent: string): Promise<UserPermission[]> {
  const userPermissions: UserPermission[] = [];
  let pageToken: string | undefined;

  do {
    const args = pageToken ? { parent, pageToken } : { parent };
    const res = await client.accounts.user_permissions.list(args);
    userPermissions.push(...(res.data.userPermission ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return userPermissions;
}
