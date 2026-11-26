import type { Config } from "../config/schema.js";
import { runShell } from "../utils/exec.js";
import { tail } from "../utils/text.js";

export type InstallResult = { ok: true } | { ok: false; reason: string };

/**
 * Install dependencies inside one worktree (each has its own install: lockfiles may differ).
 * Failure is data, not an exception: the classifier turns it into BASELINE_UNAVAILABLE / ENV_BROKEN_BY_PR.
 * To reduce risk from untrusted PRs, set installCommand to e.g. "npm ci --ignore-scripts" in the config.
 */
export async function installDeps(root: string, config: Config): Promise<InstallResult> {
  const r = await runShell(config.installCommand, {
    cwd: root,
    timeoutMs: config.installTimeoutMs,
    memoryLimitMb: config.memoryLimitMb,
  });
  if (r.exitCode === 0 && !r.timedOut) return { ok: true };
  return { ok: false, reason: r.timedOut ? "install timed out" : `install failed: ${tail(r.output, 1500)}` };
}