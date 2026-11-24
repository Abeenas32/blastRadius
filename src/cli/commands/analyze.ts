import { InvalidArgumentError, type Command } from "commander";
import { loadConfig } from "../../config/load.js";
import { analyze } from "../../orchestrator/orchestrator.js";

function parsePositiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError("must be a positive integer");
  return n;
}

type AnalyzeFlags = {
  pr: number;
  repo: string;
  config?: string;
  json?: boolean;
};

export function registerAnalyze(program: Command): void {
  program
    .command("analyze")
    .description("Decide whether a PR caused its failing tests, and explain why")
    .requiredOption("--pr <number>", "pull request number", parsePositiveInt)
    .option("--repo <path>", "path to the local git repository", process.cwd())
    .option("--config <path>", "path to a config file (default: search for .changepilotrc.json)")
    .option("--json", "print the report as JSON on stdout")
    .action(async (flags: AnalyzeFlags) => {
      const config = await loadConfig({ cwd: flags.repo, configPath: flags.config });
      const result = await analyze({ repoPath: flags.repo, prNumber: flags.pr, config });
      // Only the final report goes to stdout (logs go to stderr).
      console.log(flags.json ? JSON.stringify(result, null, 2) : `Analyzed PR #${result.prNumber}`);
    });
}