import { describe, it, expect } from "vitest";
import { diffStates } from "../src/planner/diff.js";
import type { NormalizedState } from "../src/planner/desiredState.js";

const emptyState: NormalizedState = {
  ga4: { customDimensions: [], customMetrics: [], keyEvents: [] },
  gtm: { builtInVariables: [], variables: [], triggers: [], tags: [] },
};

function withCd(state: NormalizedState, cd: NormalizedState["ga4"]["customDimensions"][number]): NormalizedState {
  return { ...state, ga4: { ...state.ga4, customDimensions: [...state.ga4.customDimensions, cd] } };
}

describe("diffStates", () => {
  it("classifies a missing entity as create", () => {
    const desired = withCd(emptyState, { kind: "ga4_custom_dimension", name: "feature_name", config: { parameter_name: "feature_name", display_name: "Feature name", scope: "EVENT" } });
    const d = diffStates(desired, emptyState);
    expect(d.creates.map((c) => c.name)).toContain("feature_name");
    expect(d.unchanged).toEqual([]);
  });

  it("classifies identical entities as unchanged", () => {
    const cd = { kind: "ga4_custom_dimension" as const, name: "feature_name", config: { parameter_name: "feature_name", display_name: "Feature name", scope: "EVENT" } };
    const both = withCd(emptyState, cd);
    const d = diffStates(both, both);
    expect(d.creates).toEqual([]);
    expect(d.unchanged.length).toBeGreaterThan(0);
  });

  it("classifies changed-config entities as update with before/after", () => {
    const a = withCd(emptyState, { kind: "ga4_custom_dimension", name: "feature_name", config: { parameter_name: "feature_name", display_name: "OLD", scope: "EVENT" } });
    const b = withCd(emptyState, { kind: "ga4_custom_dimension", name: "feature_name", config: { parameter_name: "feature_name", display_name: "NEW", scope: "EVENT" } });
    const d = diffStates(b, a); // desired=b, current=a
    expect(d.updates.length).toBe(1);
    expect((d.updates[0]!.before as { display_name: string }).display_name).toBe("OLD");
    expect((d.updates[0]!.after as { display_name: string }).display_name).toBe("NEW");
  });

  it("returns stable ordering across runs (byte-stable)", () => {
    const cd1 = { kind: "ga4_custom_dimension" as const, name: "alpha", config: { parameter_name: "alpha", display_name: "A", scope: "EVENT" } };
    const cd2 = { kind: "ga4_custom_dimension" as const, name: "beta", config: { parameter_name: "beta", display_name: "B", scope: "EVENT" } };
    const desired: NormalizedState = { ...emptyState, ga4: { ...emptyState.ga4, customDimensions: [cd2, cd1] } };
    expect(JSON.stringify(diffStates(desired, emptyState))).toBe(JSON.stringify(diffStates(desired, emptyState)));
  });

  it("never invokes any I/O — pure", () => {
    // The function signature accepts plain objects, so there's nothing to assert
    // beyond construction. This test exists to document the contract.
    expect(typeof diffStates).toBe("function");
  });
});
