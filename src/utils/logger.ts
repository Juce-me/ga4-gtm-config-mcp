// stderr only (stdout reserved for MCP transport)
export const logger = {
  info: (msg: string, extra: Record<string, unknown> = {}) =>
    process.stderr.write(JSON.stringify({ level: "info", msg, ...extra }) + "\n"),
  warn: (msg: string, extra: Record<string, unknown> = {}) =>
    process.stderr.write(JSON.stringify({ level: "warn", msg, ...extra }) + "\n"),
  error: (msg: string, extra: Record<string, unknown> = {}) =>
    process.stderr.write(JSON.stringify({ level: "error", msg, ...extra }) + "\n"),
};
