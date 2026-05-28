export function datedWorkspaceName(base: string, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${base}-${y}-${m}-${d}`;
}

export function slugifyEntityName(name: string): string {
  return name.trim();
}
