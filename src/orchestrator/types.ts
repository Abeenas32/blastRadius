import type { Config } from "../config/schema.js";

/** Section 5. Assigned only by the deterministic classifier; the agent never changes it. */
export const CLASSIFICATIONS = [
  "NO_ISSUE",
  "FIXED_BY_PR",
  "PRE_EXISTING",
  "PRE_EXISTING_FLAKY",
  "ENV_PRE_EXISTING",
  "TEST_REMOVED",
  "BASELINE_UNAVAILABLE",
  "REGRESSION",
  "DETERMINISM_REGRESSION",
  "CHANGED_FAILURE",
  "NEW_TEST_FAILS",
  "ENV_BROKEN_BY_PR",
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

/** Classifications that go to the LLM investigation; everything else is reported straight away. */
const INVESTIGATE: ReadonlySet<Classification> = new Set([
  "REGRESSION",
  "DETERMINISM_REGRESSION",
  "CHANGED_FAILURE",
  "NEW_TEST_FAILS",
  "ENV_BROKEN_BY_PR",
]);

export const needsInvestigation = (c: Classification): boolean => INVESTIGATE.has(c);

export type AnalyzeOptions = {
  repoPath: string;
  prNumber: number;
  config: Config;
};

export type AnalyzeResult = {
  prNumber: number;
  // Grows as phases land: classifications, clusters, report.
};