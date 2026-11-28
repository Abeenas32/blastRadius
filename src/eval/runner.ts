import { join } from "node:path";
import type { CompleteFn } from "../agent/llm.js";
import { applyOverrides, type Config } from "../config/schema.js";
import { ensureClone, ensureCommit } from "../ingestion/git.js";
import { runPipeline } from "../orchestrator/orchestrator.js";
import { evalError } from "../utils/error.js";
import type { LlmCache } from "../utils/llmCache.js";
import { log } from "../utils/logger.js";
import { runBaseline } from "./baseline.js";
import type { EvalCase } from "./cases.js";
import type { CaseResult } from "./score.js";

export type EvalOptions = {
  cases: readonly EvalCase[];
  config: Config;
  runs: number; // LLM runs per case (the classifier part is deterministic and done once per case)
  classifierOnly: boolean; // true = config B only: no LLM calls, no cost
  complete: CompleteFn | undefined; // required unless classifierOnly
  cache: LlmCache;
};

const slug = (repo: string): string => repo.replace(/[^\w.-]+/g, "_");
const costOf = (usage: { inputTokens: number; outputTokens: number }, p: { input: number; output: number }): number =>
  (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000;

/**
 * Run configs B (classifier only) and A (naive baseline) over the labelled cases, one case at a time
 * (test suites may share ports). A case that cannot run is recorded as ERROR and reported as "dropped".
 */
export async function runEval(opts: EvalOptions): Promise<CaseResult[]> {
  const { config, cache } = opts;
  const price = config.pricingUsdPerMTok[config.models.agent];

  // Refuse to spend money blind: without prices the budget guard (K9) cannot work.
  if (!opts.classifierOnly) {
    if (!opts.complete) throw evalError("No LLM client configured (set ANTHROPIC_API_KEY, or use --classifier-only)");
    if (!price) {
      throw evalError(
        `pricingUsdPerMTok has no entry for "${config.models.agent}". Add its input/output USD per million tokens to .changepilotrc.json so the $${config.budgetUsd} budget guard works.`,
      );
    }
  }

  const results: CaseResult[] = [];
  let spend = 0; // money actually charged this session (cached answers are free)
  let budgetHit = false;

  for (const c of opts.cases) {
    if (budgetHit) break;
    const started = Date.now();
    log.info(`case ${c.id} (${c.source})`);
    const caseConfig = applyOverrides(config, c.config);

    try {
      // Steps 1-4 once per case: ground truth does not change between LLM runs.
      const repoDir = join(config.workDir, "repos", slug(c.repo));
      await ensureClone(c.repo, repoDir);
      await ensureCommit(repoDir, c.baseSha);
      await ensureCommit(repoDir, c.prSha);
      const out = await runPipeline({ repoDir, baseSha: c.baseSha, prSha: c.prSha, config: caseConfig });
      const pipelineMs = Date.now() - started;

      // Config A only runs where there is a labelled root cause to score it against (saves budget).
      const runBaselineHere = !opts.classifierOnly && c.rootCauseFile !== undefined;
      const runCount = runBaselineHere ? opts.runs : 1;

      for (let run = 0; run < runCount; run++) {
        if (runBaselineHere && spend >= config.budgetUsd) {
          log.warn(`budget of $${config.budgetUsd} reached: stopping (K9)`);
          budgetHit = true;
          break;
        }
        const t0 = Date.now();
        const base = runBaselineHere
          ? await runBaseline(
              { diff: out.diffText, failureLog: out.prFailureLog },
              { complete: opts.complete!, cache, model: config.models.agent, runIndex: run, maxDiffChars: config.maxDiffChars, maxLogChars: config.maxLogChars },
            )
          : undefined;
        const cost = base && price ? costOf(base.usage, price) : 0;
        if (base && !base.cached) spend += cost;

        results.push({
          caseId: c.id,
          source: c.source,
          run,
          expected: c.expectedClassification,
          actual: out.classified.overall,
          expectedFile: c.rootCauseFile,
          predictedFile: base?.report?.rootCause.file,
          baselineAttempted: runBaselineHere,
          validOutput: base?.report !== undefined,
          costUsd: cost,
          ms: pipelineMs + (Date.now() - t0),
          error: base?.error,
        });
      }
    } catch (err) {
      log.warn(`case ${c.id} dropped: ${(err as Error).message}`);
      results.push({
        caseId: c.id, source: c.source, run: 0, expected: c.expectedClassification, actual: "ERROR",
        expectedFile: c.rootCauseFile, predictedFile: undefined, baselineAttempted: false, validOutput: false,
        costUsd: 0, ms: Date.now() - started, error: (err as Error).message,
      });
    }
  }
  return results;
}