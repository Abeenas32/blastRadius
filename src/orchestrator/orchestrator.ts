import { classify } from "../classifier/classify.js";
import { fetchPrInfo, parseRepo } from "../ingestion/github.js";
import { fetchBranchTip, fetchPrHead, getDiffText, getOriginUrl, mergeBase } from "../ingestion/git.js";
import { collectViews, type Target } from "../testing/rerun.js";
import { log } from "../utils/logger.js";
import { installDeps, type InstallResult } from "../workspace/install.js";
import { withWorktrees } from "../workspace/worktree.js";
import type { AnalyzeOptions, AnalyzeResult, PipelineInput, PipelineOutput } from "./types.js";

const MAX_TESTS_SHOWN = 50;

// An install result becomes either a testable folder or a reason it is unavailable.
const toTarget = (root: string, install: InstallResult): Target =>
  install.ok ? { root } : { unavailable: install.reason };

/**
 * Steps 2-4 of the pipeline (section 3) for two known commits:
 *   2. two worktrees (merge-base and PR head), dependencies installed in each
 *   3. run the suite once per commit, then re-run failing files at both commits
 *   4. normalize, match by test id, classify
 * Worktrees are always removed (finally inside withWorktrees).
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { repoDir, baseSha, prSha, config } = input;

  // The baseline is the merge-base, not the base tip, so unrelated commits on main never show up as PR failures.
  const baselineSha = await mergeBase(repoDir, baseSha, prSha);
  const diffText = await getDiffText(repoDir, baselineSha, prSha);

  return withWorktrees(repoDir, { baseline: baselineSha, pr: prSha }, async (paths) => {
    log.info("installing dependencies in both worktrees");
    // Installs do not clash with each other (unlike test runs), so they go in parallel.
    const [baseInstall, prInstall] = await Promise.all([installDeps(paths.baseline, config), installDeps(paths.pr, config)]);

    log.info("running the suite at the baseline and at the PR head");
    const runs = await collectViews(toTarget(paths.baseline, baseInstall), toTarget(paths.pr, prInstall), config);

    return { mergeBase: baselineSha, diffText, classified: classify(runs.baseline, runs.pr), prFailureLog: runs.prFailureLog };
  });
}

/** `changepilot analyze --pr N`: step 1 (ingestion), then steps 2-4. The agent loop arrives in Phase 2. */
export async function analyze(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  const { repoPath, prNumber, config } = opts;

  // Step 1. Ask GitHub which branch the PR targets; if that is impossible (offline, private repo without a
  // token, non-GitHub remote), fall back to the configured base branch rather than failing.
  let baseRef = config.baseBranch;
  const gh = parseRepo((await getOriginUrl(repoPath)) ?? "");
  if (gh) {
    try {
      baseRef = (await fetchPrInfo(gh, prNumber, { token: process.env.GITHUB_TOKEN })).baseRef;
    } catch (err) {
      log.warn(`could not read PR metadata from GitHub (${(err as Error).message}); using base branch "${baseRef}"`);
    }
  }

  const headSha = await fetchPrHead(repoPath, prNumber); // refs/pull/N/head also works for fork PRs
  const baseSha = await fetchBranchTip(repoPath, baseRef);

  const out = await runPipeline({ repoDir: repoPath, baseSha, prSha: headSha, config });
  return {
    prNumber,
    baseSha,
    mergeBase: out.mergeBase,
    headSha,
    classification: out.classified.overall,
    reason: out.classified.reason,
    counts: out.classified.counts,
    tests: out.classified.tests.slice(0, MAX_TESTS_SHOWN),
    testsOmitted: Math.max(0, out.classified.tests.length - MAX_TESTS_SHOWN),
  };
}