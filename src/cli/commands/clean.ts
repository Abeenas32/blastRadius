import type { Command } from "commander";
import { cleanLeftovers } from "../../workspace/worktree.js";
import { log } from "../../utils/logger.js";

export function registerClean(program: Command): void {
  program
    .command("clean")
    .description("Remove leftover worktrees from crashed or interrupted runs")
    .option("--repo <path>", "also prune git's worktree records in this repository", process.cwd())
    .action(async (flags: { repo: string }) => {
      const removed = await cleanLeftovers(flags.repo);
      log.info(`removed ${removed} leftover worktree folder(s)`);
    });
}