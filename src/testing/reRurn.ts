import { access } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../src/utils/logger.js";
import { tail } from "../src/utils/text.js";
import { runSuite } from "./runner.js";
import type { CommitView, Observation, SuiteRun, TestResult } from "./types.js"; 
import type { Config }  from "../src/config/schema.js";
 

// A commit we can test (`root` = installed worktree) or one that could not be set up.
export type Target = { root: string } | { unavailable: string };

export type CollectedRuns = { baseline: CommitView; pr: CommitView; prFailureLog: string };

/** Test files that contain at least one failing test in this run. */
const failingFiles = (run: SuiteRun | undefined): string[] =>
  run?.kind === "ran" ? [...new Set(run.results.filter((r) => r.status === "failed").map((r) => r.file))] : [];

const fileExists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Re-run the failing files `config.rerunCount` times. Only files that exist at THIS commit are passed:
 * a test file added by the PR does not exist at the baseline, and naming it would make the runner fail.
 */
async function rerunFiles(root: string, config: Config, files: readonly string[]): Promise<TestResult[][]> {
  const present: string[] = [];
  for (const f of files) if (await fileExists(join(root, f))) present.push(f);
  if (present.length === 0) return [];

  const extra: TestResult[][] = [];
  for (let i = 0; i < config.rerunCount; i++) {
    const run = await runSuite(root, config, present);
    if (run.kind === "ran") extra.push(run.results);
    else log.warn(`rerun ${i + 1} could not start at ${root}; ignoring it`);
  }
  return extra;
}

/** Turn the first run plus reruns into what the classifier consumes: test id -> list of observations. */
function toView(target: Target, first: SuiteRun | undefined, extra: TestResult[][]): CommitView {
  if (!("root" in target)) return { state: "unavailable", reason: target.unavailable };
  if (!first || first.kind === "start_error") {
    return { state: "start_error", signature: first?.kind === "start_error" ? first.signature : "no result" };
  }
  const tests = new Map<string, Observation[]>();
  for (const run of [first.results, ...extra]) {
    for (const r of run) {
      if (r.status === "skipped") continue; // skipped tests say nothing about pass/fail
      const list = tests.get(r.id) ?? [];
      list.push({ status: r.status, failure: r.failure });
      tests.set(r.id, list);
    }
  }
  return { state: "ran", tests };
}

/** Readable failure log of the PR's first run, used as input for the naive baseline (config A). */
function buildFailureLog(first: SuiteRun | undefined, pr: Target): string {
  if (!("root" in pr)) return `The PR could not be set up: ${pr.unavailable}`;
  if (!first) return "";
  if (first.kind === "start_error") return `The test suite failed to start:\n${tail(first.output, 6000)}`;
  return first.results
    .filter((r) => r.status === "failed")
    .map((r) => `FAIL ${r.id}\n${tail(r.rawFailure, 3000)}`)
    .join("\n\n");
}

/**
 * Steps 3-4 input: run the suite once per commit, then re-run every file that fails at EITHER commit
 * `rerunCount` times at BOTH commits (section 5, flakiness rule).
 */
export async function collectViews(base: Target, pr: Target, config: Config): Promise<CollectedRuns> {
  const first = (t: Target): Promise<SuiteRun | undefined> =>
    "root" in t ? runSuite(t.root, config) : Promise.resolve(undefined);

  // Sequential on purpose: tests may share fixed ports or a database (section 8).
  const baseFirst = await first(base);
  const prFirst = await first(pr);

  const files = [...new Set([...failingFiles(baseFirst), ...failingFiles(prFirst)])];
  const baseExtra = "root" in base ? await rerunFiles(base.root, config, files) : [];
  const prExtra = "root" in pr ? await rerunFiles(pr.root, config, files) : [];

  return {
    baseline: toView(base, baseFirst, baseExtra),
    pr: toView(pr, prFirst, prExtra),
    prFailureLog: buildFailureLog(prFirst, pr),
  };
}