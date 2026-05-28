import { describe, it, expect, beforeEach } from "vitest";
import { rmSync, readdirSync, readFileSync } from "node:fs";
import { audit } from "../src/safety/auditLog.js";

const AUDIT_DIR = ".audit";

describe("auditLog.audit", () => {
  beforeEach(() => {
    rmSync(AUDIT_DIR, { recursive: true, force: true });
  });

  it("writes a JSON line to .audit/audit-YYYY-MM-DD.log", async () => {
    await audit("spec_loaded", { spec_path: "x.yaml", mode: "dry_run" });
    const files = readdirSync(AUDIT_DIR);
    expect(files.length).toBe(1);
    const content = readFileSync(`${AUDIT_DIR}/${files[0]!}`, "utf8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.event).toBe("spec_loaded");
    expect(parsed.spec_path).toBe("x.yaml");
    expect(parsed.mode).toBe("dry_run");
    expect(typeof parsed.ts).toBe("string");
  });

  it("redacts secret-shaped keys in the payload", async () => {
    await audit("publish_blocked", { token: "abc123", oauth_refresh_token: "xyz", reason: "missing approval" });
    const files = readdirSync(AUDIT_DIR);
    const content = readFileSync(`${AUDIT_DIR}/${files[0]!}`, "utf8");
    expect(content).toContain('"reason":"missing approval"');
    expect(content).not.toContain("abc123");
    expect(content).not.toContain("xyz");
    expect(content).toContain('"[REDACTED]"');
  });

  it("appends — multiple events in one file", async () => {
    await audit("spec_loaded", { spec_path: "a.yaml" });
    await audit("validation_passed", { spec_path: "a.yaml" });
    const files = readdirSync(AUDIT_DIR);
    expect(files.length).toBe(1);
    const lines = readFileSync(`${AUDIT_DIR}/${files[0]!}`, "utf8").trim().split("\n");
    expect(lines.length).toBe(2);
  });
});
