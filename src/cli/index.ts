import { Command } from "commander";
import { isChangePilotError } from "../utils/error.js";
import { log, setLogLevel } from "../utils/logger.js";
import { registerAnalyze } from "./commands/analyze.js";
import { registerClean } from "./commands/clean.js";
import { registerEval } from "./commands/eval.js";

export function buildProgram(): Command {
  const program = new Command()
    .name("changepilot")
    .description("Decide whether a PR caused a failing test run, with a verified root cause")
    .version("0.1.0")
    .option("-v, --verbose", "debug logging")
    .hook("preAction", (cmd) => setLogLevel(cmd.opts().verbose ? "debug" : "info"));
    // Inspects a PR and a failing test run to determine if the PR caused the failure and identify the root cause.
  registerAnalyze(program);
  // Runs evaluation/benchmarking against test cases or historical PR/test runs to measure accuracy or behavior.
  registerClean(program);
  // Cleans up temporary artifacts, cached data, or workspace state created by prior runs.
  registerEval(program);
  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    if (isChangePilotError(err)) {
        // expected failure: message only, no stack
      log.error(err.message);
      process.exitCode = 1;
    } else {
        // bug: keep the stack
      log.error((err as Error).stack ?? String(err));
      process.exitCode = 2;
    }
  }
}