const SECRET_KEY_RE = /(token|secret|password|refresh_token|api[_-]?key|oauth|client_secret|authorization)/i;

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[REDACTED]" : redact(v);
    }
    return out as unknown as T;
  }
  return value;
}
