function segmentId(value: string, segment: string): string {
  const parts = value.split("/");
  const index = parts.lastIndexOf(segment);
  return index >= 0 ? parts[index + 1] ?? value : value;
}

export function accountId(value: string): string {
  return segmentId(value, "accounts");
}

export function containerId(value: string): string {
  return segmentId(value, "containers");
}

export function workspaceId(value: string): string {
  return segmentId(value, "workspaces");
}

export function versionId(value: string): string {
  return segmentId(value, "versions");
}

export function containerPath(accountIdOrName: string, containerIdOrName: string): string {
  return `accounts/${accountId(accountIdOrName)}/containers/${containerId(containerIdOrName)}`;
}

export function workspacePath(
  accountIdOrName: string,
  containerIdOrName: string,
  workspaceIdOrName: string,
): string {
  return `${containerPath(accountIdOrName, containerIdOrName)}/workspaces/${workspaceId(workspaceIdOrName)}`;
}

export function workspacePathFromName(value: string): string {
  return workspacePath(value, value, value);
}

export function versionPath(
  accountIdOrName: string,
  containerIdOrName: string,
  workspaceIdOrName: string,
): string {
  return workspacePath(accountIdOrName, containerIdOrName, workspaceIdOrName);
}

export function containerVersionPath(
  accountIdOrName: string,
  containerIdOrName: string,
  versionIdOrName: string,
): string {
  return `${containerPath(accountIdOrName, containerIdOrName)}/versions/${versionId(versionIdOrName)}`;
}
