import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config/schema.js";

describe("parseConfig", () => {
  it("applies defaults, including the pinned models", () => {
    const cfg = parseConfig({ testCommand: "npx vitest run", reporter: "vitest" });
    expect(cfg).toMatchObject({
      baseBranch: "main",
      parallel: false,
      maxIterations: 12,
      maxRetries: 2,
      maxClusters: 3,
      budgetUsd: 50,
      models: { agent: "claude-sonnet-5-5", entailment: "claude-haiku-5-5" },
    });
  });
  it("rejects unknown keys (typos)", () => {
    expect(() => parseConfig({ testCommand: "x", reporter: "jest", maxIteration: 5 })).toThrow(/maxIteration/);
  });
  it("reports missing required fields readably", () => {
    expect(() => parseConfig({ reporter: "jest" })).toThrow(/testCommand/);
  });
});