import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertRuntimeCredentialSource } from "../src/auth/credentialSource.js";

const tmpDirs: string[] = [];

function writeCredential(body: object): string {
  const dir = mkdtempSync(join(tmpdir(), "ga4-gtm-auth-"));
  tmpDirs.push(dir);
  const path = join(dir, "credentials.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return path;
}

function impersonatedAdc(overrides: object = {}): object {
  return {
    type: "impersonated_service_account",
    source_credentials: {
      type: "authorized_user",
      client_id: "fake",
      client_secret: "fake",
      refresh_token: "fake",
    },
    service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com:generateAccessToken",
    delegates: [],
    scopes: ["https://www.googleapis.com/auth/tagmanager.readonly"],
    ...overrides,
  };
}

describe("assertRuntimeCredentialSource", () => {
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("allows service account credential JSON", () => {
    const path = writeCredential({
      type: "service_account",
      client_email: "svc@example.iam.gserviceaccount.com",
      private_key: "fake",
    });

    expect(assertRuntimeCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: path })).toBe("service_account");
  });

  it("allows external account credential JSON for workload identity federation", () => {
    const path = writeCredential({
      type: "external_account",
      audience: "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/p",
    });

    expect(assertRuntimeCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: path })).toBe("external_account");
  });

  it("rejects authorized_user ADC credentials", () => {
    const path = writeCredential({
      type: "authorized_user",
      client_id: "fake",
      client_secret: "fake",
      refresh_token: "fake",
    });

    expect(() => assertRuntimeCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: path })).toThrowError(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });

  it("rejects impersonated ADC credentials without explicit opt-in", () => {
    const path = writeCredential(impersonatedAdc());

    expect(() => assertRuntimeCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: path })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("ALLOW_GOOGLE_IMPERSONATED_ADC=1"),
      }),
    );
  });

  it("allows impersonated ADC credentials with explicit opt-in", () => {
    const path = writeCredential(impersonatedAdc());

    expect(assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toBe("impersonated_adc");
  });

  it("rejects plain authorized_user ADC credentials even with impersonated ADC opt-in", () => {
    const path = writeCredential({
      type: "authorized_user",
      client_id: "fake",
      client_secret: "fake",
      refresh_token: "fake",
    });

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("plain authorized_user ADC"),
      }),
    );
  });

  it("rejects top-level authorized_user credentials with impersonation URL", () => {
    const path = writeCredential({
      type: "authorized_user",
      client_id: "fake",
      client_secret: "fake",
      refresh_token: "fake",
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com:generateAccessToken",
    });

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("plain authorized_user ADC"),
      }),
    );
  });

  it("rejects impersonated ADC without an impersonation URL string", () => {
    const path = writeCredential(impersonatedAdc({ service_account_impersonation_url: 123 }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("service_account_impersonation_url"),
      }),
    );
  });

  it("rejects impersonated ADC without object source credentials", () => {
    const path = writeCredential(impersonatedAdc({ source_credentials: null }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("source_credentials"),
      }),
    );
  });

  it("rejects impersonated ADC when source credentials are not authorized_user", () => {
    const path = writeCredential(impersonatedAdc({
      source_credentials: { type: "service_account" },
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("source_credentials.type"),
      }),
    );
  });

  it("rejects impersonated ADC with a non-IAMCredentials impersonation host", () => {
    const path = writeCredential(impersonatedAdc({
      service_account_impersonation_url: "https://example.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com:generateAccessToken",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("iamcredentials.googleapis.com"),
      }),
    );
  });

  it("rejects impersonated ADC with a non-HTTPS impersonation URL", () => {
    const path = writeCredential(impersonatedAdc({
      service_account_impersonation_url: "http://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com:generateAccessToken",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("https"),
      }),
    );
  });

  it("rejects impersonated ADC with a top-level endpoint override", () => {
    const path = writeCredential(impersonatedAdc({
      endpoint: "https://attacker.example",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("endpoint"),
      }),
    );
  });

  it("rejects impersonated ADC with a malicious top-level universe_domain", () => {
    const path = writeCredential(impersonatedAdc({
      universe_domain: "attacker.example",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("universe_domain"),
      }),
    );
  });

  it("rejects impersonated ADC with a malicious top-level universeDomain", () => {
    const path = writeCredential(impersonatedAdc({
      universeDomain: "attacker.example",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("universeDomain"),
      }),
    );
  });

  it("rejects impersonated ADC with a malicious source_credentials universe_domain", () => {
    const path = writeCredential(impersonatedAdc({
      source_credentials: {
        type: "authorized_user",
        client_id: "fake",
        client_secret: "fake",
        refresh_token: "fake",
        universe_domain: "attacker.example",
      },
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("source_credentials.universe_domain"),
      }),
    );
  });

  it("rejects impersonated ADC with a malicious source_credentials universeDomain", () => {
    const path = writeCredential(impersonatedAdc({
      source_credentials: {
        type: "authorized_user",
        client_id: "fake",
        client_secret: "fake",
        refresh_token: "fake",
        universeDomain: "attacker.example",
      },
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("source_credentials.universeDomain"),
      }),
    );
  });

  it("allows impersonated ADC with explicit googleapis.com universe domains", () => {
    const path = writeCredential(impersonatedAdc({
      universe_domain: "googleapis.com",
      universeDomain: "googleapis.com",
      source_credentials: {
        type: "authorized_user",
        client_id: "fake",
        client_secret: "fake",
        refresh_token: "fake",
        universe_domain: "googleapis.com",
        universeDomain: "googleapis.com",
      },
    }));

    expect(assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toBe("impersonated_adc");
  });

  it("rejects impersonated ADC when the impersonation URL path is not a service account resource", () => {
    const path = writeCredential(impersonatedAdc({
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/not-the-service-account-resource:generateAccessToken",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("/v1/projects/-/serviceAccounts/"),
      }),
    );
  });

  it("rejects impersonated ADC when the target principal path segment contains a slash", () => {
    const path = writeCredential(impersonatedAdc({
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com/extra:generateAccessToken",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("/v1/projects/-/serviceAccounts/"),
      }),
    );
  });

  it("rejects impersonated ADC when the impersonation URL does not generate access tokens", () => {
    const path = writeCredential(impersonatedAdc({
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com:generateIdToken",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining(":generateAccessToken"),
      }),
    );
  });

  it("rejects impersonated ADC when the impersonation URL has a query string", () => {
    const path = writeCredential(impersonatedAdc({
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com:generateAccessToken?x=1",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("query"),
      }),
    );
  });

  it("rejects impersonated ADC when the impersonation URL has a fragment", () => {
    const path = writeCredential(impersonatedAdc({
      service_account_impersonation_url: "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/service@example.iam.gserviceaccount.com:generateAccessToken#fragment",
    }));

    expect(() => assertRuntimeCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: path,
      ALLOW_GOOGLE_IMPERSONATED_ADC: "1",
    })).toThrowError(
      expect.objectContaining({
        code: "PERMISSION_DENIED",
        message: expect.stringContaining("fragment"),
      }),
    );
  });

  it("rejects missing GOOGLE_APPLICATION_CREDENTIALS unless metadata auth is explicitly allowed", () => {
    expect(() => assertRuntimeCredentialSource({})).toThrowError(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );

    expect(assertRuntimeCredentialSource({ ALLOW_GOOGLE_METADATA_AUTH: "1" })).toBe("metadata");
  });

  it("does not leak credential file paths when credentials cannot be read", () => {
    const path = join(tmpdir(), "ga4-gtm-auth-missing", "credentials.json");

    try {
      assertRuntimeCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: path });
      throw new Error("Expected assertRuntimeCredentialSource to throw");
    } catch (e) {
      expect(e).toMatchObject({
        code: "PERMISSION_DENIED",
        message: "Could not read runtime credential source.",
      });
      expect(String((e as { details?: { cause?: unknown } }).details?.cause ?? "")).not.toContain(path);
    }
  });
});
