import { randomUUID } from "node:crypto";
import { readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config/schema.js";
import { runShell, shellQuote } from "../utils/exec.js";
import { normalizeFailure, stripAnsi, stripStackFrames } from "../utils/normalize.js";
import { parseJestLikeReport } from "../testing/parsers/jestLike.js";
import type { SuiteRun } from "./types.js";

/** Flags that make the runner write its JSON report to a file (not stdout, which tests may pollute). */
const reporterFlags = (reporter: Config["reporter"], outFile: string): string =>
  reporter === "jest"
    ? `--json --outputFile=${shellQuote(outFile)}`
    : `--reporter=json --outputFile=${shellQuote(outFile)}`;

/**
 * Run the suite (or only `files`) inside `root` and return the parsed result.
 * `config.testCommand` is the BASE command ("npx vitest run", "npx jest"); the reporter flags and file
 * arguments are appended here. With `npm test` you would need "npm test --" so the flags reach the runner.
 */
export async function runSuite(root: string, config: Config, files: readonly string[] = []): Promise<SuiteRun> {
  // The report may name the worktree by its real path (symlinked temp dirs), so strip both spellings.
  const roots = [...new Set([root, await realpath(root).catch(() => root)])];
  const outFile = join(tmpdir(), `changepilot-${randomUUID()}.json`);
  const command = [config.testCommand, reporterFlags(config.reporter, outFile), ...files.map(shellQuote)].join(" ");

  try {
    const r = await runShell(command, { cwd: root, timeoutMs: config.testTimeoutMs, memoryLimitMb: config.memoryLimitMb });
    const reportText = await readFile(outFile, "utf8").catch(() => undefined);
    const results = reportText === undefined ? undefined : parseJestLikeReport(reportText, roots);
    if (results) return { kind: "ran", results }; // exit code is ignored: failing tests exit non-zero

    // No usable report: the suite could not start. The signature must be comparable across the two
    // commits, so it is normalized (paths, times, ports...) and cut to a stable length.
    const output = stripAnsi(r.output);
    const signature = r.timedOut
      ? "suite timed out"
      : normalizeFailure(stripStackFrames(output), roots).slice(0, 1500);
    return { kind: "start_error", signature, output };
  } finally {
    await rm(outFile, { force: true });
  }
}