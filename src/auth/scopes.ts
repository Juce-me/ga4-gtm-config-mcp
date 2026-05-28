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
