import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { gatePublish } from "../src/safety/publishGuards.js";

describe("publishGuards.gatePublish", () => {
  const tmp = "tests/.tmp-publish-guard";

  const okInput = () => ({
    spec: { execution: { publish_allowed: true }, target: { environment: "prod" } } as any,
    approval_token: "tok",
    validation_report_path: `${tmp}/validation.txt`,
    environment: "prod",
    version_id: "999",
    publish_scope_present: true,
    operator_requested_publish: true,
  });

  beforeEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    writeFileSync(`${tmp}/validation.txt`, "passed", "utf8");
  });

  it("passes when every condition is satisfied", async () => {
    const r = await gatePublish(okInput());
    expect(r.ok).toBe(true);
  });

  it("blocks when spec flag is false", async () => {
    const i = okInput();
    (i.spec as any).execution.publish_allowed = false;
    const r = await gatePublish(i);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("PUBLISH_BLOCKED");
  });

  it("blocks when approval_token is missing", async () => {
    const i = okInput();
    i.approval_token = "";
    expect((await gatePublish(i)).ok).toBe(false);
  });

  it("blocks when environment does not match spec.target.environment", async () => {
    const i = okInput();
    i.environment = "dev";
    expect((await gatePublish(i)).ok).toBe(false);
  });

  it("blocks when operator_requested_publish is false", async () => {
    const i = okInput();
    i.operator_requested_publish = false;
    expect((await gatePublish(i)).ok).toBe(false);
  });

  it("blocks when validation report content is not 'passed'", async () => {
    writeFileSync(`${tmp}/validation.txt`, "failed", "utf8");
    expect((await gatePublish(okInput())).ok).toBe(false);
  });
});
