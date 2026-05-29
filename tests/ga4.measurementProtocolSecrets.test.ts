import { describe, it, expect } from "vitest";
import { listMetadata, stripSecretValue } from "../src/ga4/measurementProtocolSecrets.js";
import { dataStreamName } from "../src/ga4/resourceNames.js";

describe("measurementProtocolSecrets.stripSecretValue", () => {
  it("removes secretValue even when the API returns one", () => {
    const stripped = stripSecretValue({
      name: "properties/123/dataStreams/456/measurementProtocolSecrets/789",
      displayName: "prod secret",
      secretValue: "PLAINTEXT-LEAK",
    });
    expect("secretValue" in stripped).toBe(false);
    expect((stripped as { displayName: string }).displayName).toBe("prod secret");
  });

  it("leaves entries unchanged when secretValue was already absent", () => {
    const stripped = stripSecretValue({
      name: "x",
      displayName: "y",
    });
    expect(stripped).toEqual({ name: "x", displayName: "y" });
  });
});

describe("measurementProtocolSecrets.listMetadata", () => {
  it("normalizes a full data stream name before listing secrets", async () => {
    let parent = "";
    const fakeClient = {
      properties: {
        dataStreams: {
          measurementProtocolSecrets: {
            list: async (opts: { parent: string }) => {
              parent = opts.parent;
              return { data: { measurementProtocolSecrets: [] } };
            },
          },
        },
      },
    } as unknown as Parameters<typeof listMetadata>[0];

    await listMetadata(fakeClient, "properties/123", "properties/123/dataStreams/456");

    expect(parent).toBe("properties/123/dataStreams/456");
  });

  it("returns the stripped list from a stubbed client", async () => {
    const fakeClient = {
      properties: {
        dataStreams: {
          measurementProtocolSecrets: {
            list: async () => ({
              data: {
                measurementProtocolSecrets: [
                  { name: "n/1", displayName: "one", secretValue: "leak-1" },
                  { name: "n/2", displayName: "two" },
                ],
              },
            }),
          },
        },
      },
    } as unknown as Parameters<typeof listMetadata>[0];

    const result = await listMetadata(fakeClient, "properties/123", "456");
    expect(result.length).toBe(2);
    for (const item of result) {
      expect("secretValue" in item).toBe(false);
    }
  });
});

describe("ga4.resourceNames.dataStreamName", () => {
  it("builds a data stream name from a bare stream ID", () => {
    expect(dataStreamName("properties/123", "456")).toBe("properties/123/dataStreams/456");
  });

  it("returns a full data stream name unchanged", () => {
    expect(dataStreamName("properties/123", "properties/123/dataStreams/456")).toBe(
      "properties/123/dataStreams/456",
    );
  });
});
