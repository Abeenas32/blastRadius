import type { CommitView, Observation } from "../testing/types.js";
import { CLASSIFICATIONS, type Classification, type ClassifiedRun, type TestVerdict } from "./types.js";

//  per-test classification (pure, no I/O) 

// all runs passed / all runs failed / mixed
type Behaviour = "pass" | "fail" | "flaky";

const behaviourOf = (runs: readonly Observation[]): Behaviour => {
  const failed = runs.filter((r) => r.status === "failed").length;
  return failed === 0 ? "pass" : failed === runs.length ? "fail" : "flaky";
};

// The distinct normalized failure texts seen across runs, sorted so two lists compare with ===.
const failureSet = (runs: readonly Observation[]): string[] =>
  [...new Set(runs.filter((r) => r.status === "failed").map((r) => r.failure))].sort();

const sameFailures = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((f, i) => f === b[i]);

export function classifyTest(
  baseline: readonly Observation[] | undefined,
  pr: readonly Observation[] | undefined,
): Classification {
  if (baseline === undefined && pr === undefined) return "NO_ISSUE"; // cannot happen; keeps the function total
  if (baseline === undefined) return behaviourOf(pr!) === "pass" ? "NO_ISSUE" : "NEW_TEST_FAILS";
  if (pr === undefined) return "TEST_REMOVED";

  const b = behaviourOf(baseline);
  const p = behaviourOf(pr);

  if (b === "pass") return p === "pass" ? "NO_ISSUE" : p === "fail" ? "REGRESSION" : "DETERMINISM_REGRESSION";

  if (b === "fail") {
    if (p === "pass") return "FIXED_BY_PR";
    if (p === "flaky") return "PRE_EXISTING_FLAKY";
    return sameFailures(failureSet(baseline), failureSet(pr)) ? "PRE_EXISTING" : "CHANGED_FAILURE";
  }

  // baseline flaky
  if (p === "pass") return "NO_ISSUE";
  if (p === "flaky") return "PRE_EXISTING_FLAKY";
  const seenBefore = new Set(failureSet(baseline));
  return failureSet(pr).every((f) => seenBefore.has(f)) ? "PRE_EXISTING_FLAKY" : "CHANGED_FAILURE";
}

//                 whole-suite classification 

/** Rows about the environment. Returns undefined when both commits ran, so tests are compared one by one. */
function classifySuite(
  baseline: CommitView,
  pr: CommitView,
): { classification: Classification; reason: string } | undefined {
  if (baseline.state === "unavailable") {
    return { classification: "BASELINE_UNAVAILABLE", reason: `baseline could not be set up: ${baseline.reason}` };
  }
  if (baseline.state === "start_error") {
    // Both fail to start the same way: not the PR's fault. Anything else: we cannot compare, so do not guess.
    if (pr.state === "start_error" && pr.signature === baseline.signature) {
      return { classification: "ENV_PRE_EXISTING", reason: "the suite fails to start identically at both commits" };
    }
    return { classification: "BASELINE_UNAVAILABLE", reason: "the baseline suite fails to start, so there is nothing to compare" };
  }
  // baseline ran fine
  if (pr.state === "unavailable") {
    return { classification: "ENV_BROKEN_BY_PR", reason: `the PR could not be set up: ${pr.reason}` };
  }
  if (pr.state === "start_error") {
    return { classification: "ENV_BROKEN_BY_PR", reason: "the suite starts at the baseline but not at the PR" };
  }
  return undefined;
}

// Which label represents the PR when several tests have different labels: most actionable first.
const SEVERITY: readonly Classification[] = [
  "ENV_BROKEN_BY_PR",
  "REGRESSION",
  "DETERMINISM_REGRESSION",
  "CHANGED_FAILURE",
  "NEW_TEST_FAILS",
  "BASELINE_UNAVAILABLE",
  "ENV_PRE_EXISTING",
  "PRE_EXISTING",
  "PRE_EXISTING_FLAKY",
  "TEST_REMOVED",
  "FIXED_BY_PR",
  "NO_ISSUE",
];

const emptyCounts = (): Record<Classification, number> =>
  Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>;

/** Classify a whole PR from the two commit views. Pure: same input, same output. */
export function classify(baseline: CommitView, pr: CommitView): ClassifiedRun {
  const counts = emptyCounts();

  const suite = classifySuite(baseline, pr);
  if (suite) {
    counts[suite.classification] = 1;
    return { overall: suite.classification, reason: suite.reason, tests: [], counts };
  }
  if (baseline.state !== "ran" || pr.state !== "ran") throw new Error("unreachable: classifySuite handled this");

  const tests: TestVerdict[] = [];
  for (const id of new Set([...baseline.tests.keys(), ...pr.tests.keys()])) {
    const classification = classifyTest(baseline.tests.get(id), pr.tests.get(id));
    counts[classification]++;
    if (classification !== "NO_ISSUE") tests.push({ id, classification });
  }
  tests.sort((a, b) => a.id.localeCompare(b.id));

  const overall = SEVERITY.find((c) => counts[c] > 0) ?? "NO_ISSUE";
  const n = counts[overall];
  return { overall, reason: `${n} test${n === 1 ? "" : "s"} classified ${overall}`, tests, counts };
}