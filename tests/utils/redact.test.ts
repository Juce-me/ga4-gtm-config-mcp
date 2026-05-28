import { describe, it, expect } from "vitest";
import { redact } from "../../src/utils/redact.js";

describe("redact", () => {
  it("redacts known secret-shaped keys (case-insensitive, nested)", () => {
    const input = { name: "ok", oauth_token: "abc", nested: { client_secret: "xyz", safe: 1 } };
    expect(redact(input)).toEqual({
      name: "ok",
      oauth_token: "[REDACTED]",
      nested: { client_secret: "[REDACTED]", safe: 1 },
    });
  });

  it("never mutates the input", () => {
    const input = { secret: "x" };
    redact(input);
    expect(input.secret).toBe("x");
  });

  it("walks arrays", () => {
    expect(redact([{ password: "p" }])).toEqual([{ password: "[REDACTED]" }]);
  });

  it("redacts private_key, private-key, credentials, credential", () => {
    expect(redact({ private_key: "PEM", "private-key": "PEM", credentials: {x: 1}, credential: "x" })).toEqual({
      private_key: "[REDACTED]",
      "private-key": "[REDACTED]",
      credentials: "[REDACTED]",
      credential: "[REDACTED]",
    });
  });
});
