import type { Config } from "../config/schema.js";
import type { ClassifiedRun, TestVerdict } from "../classifier/types.js";

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

export type PipelineInput = {
  repoDir: string;
  baseSha: string;
  prSha: string;
  config: Config;
};

export type PipelineOutput = {
  // the baseline commit actually tested
  mergeBase: string;
  // what the PR changed, relative to the baseline
  diffText: string;
  // final: the agent never changes it
  classified: ClassifiedRun;
  // readable failures of the PR run (input for the naive baseline)
  prFailureLog: string;
};
export const needsInvestigation = (c: Classification): boolean =>
  INVESTIGATE.has(c);

export type AnalyzeOptions = {
  repoPath: string;
  prNumber: number;
  config: Config;
};

export type AnalyzeResult = {
  prNumber: number;
  // base-branch tip
  baseSha: string;
  // baseline commit
  mergeBase: string;
  // PR head
  headSha: string;
  classification: ClassifiedRun["overall"];
  reason: string;
  counts: ClassifiedRun["counts"];
  // non-NO_ISSUE tests (capped for readability)
  tests: TestVerdict[];
  // how many more were cut by the cap
  testsOmitted: number;
};
