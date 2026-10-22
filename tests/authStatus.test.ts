import { describe, it, expect } from "vitest";
import { checkAuthStatus, type AuthStatusDeps } from "../src/auth/authStatus.js";
import { ALL_LOGIN_SCOPES, READ_SCOPES } from "../src/auth/scopes.js";

function deps(over: Partial<AuthStatusDeps> = {}): AuthStatusDeps {
  return {
    env: {},
    acquireToken: async () => ({ grantedScopes: [...ALL_LOGIN_SCOPES] }),
    probeGa4: async () => {},
    probeGtm: async () => {},
    ...over,
  };
}
const byId = (r: Awaited<ReturnType<typeof checkAuthStatus>>, id: string) => r.checks.find((c) => c.id === id);

describe("checkAuthStatus", () => {
  it("fails on a relative GOOGLE_APPLICATION_CREDENTIALS and stops before touching ADC", async () => {
    let acquired = false;
    const r = await checkAuthStatus({}, deps({
      env: { GOOGLE_APPLICATION_CREDENTIALS: "relative/creds.json" },
      acquireToken: async () => { acquired = true; return { grantedScopes: [] }; },
    }));

    expect(byId(r, "adc_selector")?.status).toBe("fail");
    expect(acquired).toBe(false);
    expect(r.ready.read).toBe(false);
  });

  it("points at npm run login when ADC cannot be resolved", async () => {
    const r = await checkAuthStatus({}, deps({ acquireToken: async () => { throw new Error("no creds"); } }));

    expect(byId(r, "adc_token")).toMatchObject({ status: "fail", next_step: expect.stringContaining("npm run login") });
    expect(r.ready).toEqual({ read: false, write: false, version: false, publish: false });
  });

  it("reports missing scopes and limits readiness to what the token holds", async () => {
    const r = await checkAuthStatus({}, deps({ acquireToken: async () => ({ grantedScopes: [...READ_SCOPES] }) }));

    expect(byId(r, "scopes")?.status).toBe("fail");
    expect(r.ready).toEqual({ read: true, write: false, version: false, publish: false });
  });

  it("requires INCLUDE_PUBLISH_SCOPE=1 for publish readiness", async () => {
    const off = await checkAuthStatus({}, deps());
    const on = await checkAuthStatus({}, deps({ env: { INCLUDE_PUBLISH_SCOPE: "1" } }));

    expect(off.ready).toEqual({ read: true, write: true, version: true, publish: false });
    expect(on.ready.publish).toBe(true);
  });

  it("skips resource probes when no IDs are passed", async () => {
    const r = await checkAuthStatus({}, deps());

    expect(byId(r, "ga4_read")?.status).toBe("skipped");
    expect(byId(r, "gtm_read")?.status).toBe("skipped");
  });

  it("maps 403 and 404 probe failures to distinct next steps", async () => {
    const r = await checkAuthStatus(
      { ga4_property_id: "properties/1", account_id: "1", container_id: "2" },
      deps({
        probeGa4: async () => { throw Object.assign(new Error("x"), { code: 403 }); },
        probeGtm: async () => { throw Object.assign(new Error("x"), { response: { status: 404 } }); },
      }),
    );

    expect(byId(r, "ga4_read")?.detail).toContain("403");
    expect(byId(r, "ga4_read")?.next_step).toContain("product role");
    expect(byId(r, "gtm_read")?.detail).toContain("404");
    expect(byId(r, "gtm_read")?.next_step).toContain("ID");
  });
});
