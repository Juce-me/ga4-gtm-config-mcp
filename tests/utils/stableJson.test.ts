import { describe, it, expect } from "vitest";
import { stableStringify } from "../../src/utils/stableJson.js";

describe("stableStringify", () => {
  it("sorts object keys recursively", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("two equivalent objects produce identical strings", () => {
    expect(stableStringify({ x: 1, y: 2 })).toBe(stableStringify({ y: 2, x: 1 }));
  });
});
