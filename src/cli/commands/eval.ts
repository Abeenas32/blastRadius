import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { InvalidArgumentError, type Command } from "commander";
import { createAnthropicComplete } from "../../agent/llm.js";
import { loadConfig } from "../../config/load.js";
import { loadCases } from "../../eval/cases.js";
import { runEval } from "../../eval/runner.js";
import { formatSummary } from "../../eval/score.js";
import { evalError } from "../../utils/error.js";
import { createLlmCache } from "../../utils/llmCache.js";

type EvalFlags = { cases: string; runs: number; classifierOnly?: boolean; config?: string; repo: string };

const parseRuns = (v: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError("must be an integer >= 1");
  return n;
};

export function registerEval(program: Command): void {
  program
    .command("eval")
    .description("Score the classifier (config B) and the naive baseline (config A) on the labelled cases")
    .option("--cases <dir>", "folder with case JSON files", "eval/cases")
    .option("--runs <n>", "LLM runs per case (the final table uses 3)", parseRuns, 1)
    .option("--classifier-only", "skip the LLM entirely: classification accuracy only, costs nothing")
    .option("--repo <path>", "folder to search for .changepilotrc.json", process.cwd())
    .option("--config <path>", "path to a config file")
    .action(async (flags: EvalFlags) => {
      const config = await loadConfig({ cwd: flags.repo, configPath: flags.config });
      const cases = await loadCases(flags.cases);

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!flags.classifierOnly && !apiKey) throw evalError("ANTHROPIC_API_KEY is not set (or use --classifier-only)");

      const results = await runEval({
        cases,
        config,
        runs: flags.runs,
        classifierOnly: flags.classifierOnly === true,
        complete: apiKey ? createAnthropicComplete({ apiKey }) : undefined,
        cache: createLlmCache(config.cacheDir),
      });

      // Raw per-case results are kept (eval/results is git-ignored) so the table can be rebuilt without rerunning.
      await mkdir("eval/results", { recursive: true });
      const file = join("eval/results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      await writeFile(file, JSON.stringify(results, null, 2), "utf8");

      console.log(formatSummary(results));
      console.log(`details: ${file}`);
    });
}