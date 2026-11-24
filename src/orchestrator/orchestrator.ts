import { notImplementedError } from "../utils/error.js";
import { log } from "../utils/logger.js";
import type { AnalyzeOptions, AnalyzeResult } from "./types.js";

/**
 * Pipeline driver. Grows phase by phase:
 *   Phase 1: steps 1-4 (ingest, worktrees, run, classify)
 *   Phase 2: steps 5-6 (cluster, agent loop)
 *   Phase 3: step 7    (verify)
 *   Phase 5: steps 8-9 (render, cleanup)
 */
export async function analyze(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  log.debug("analyze requested", { pr: opts.prNumber, repo: opts.repoPath });
  throw notImplementedError("analyze is not built yet: the pipeline starts in Phase 1 (days 5-8).");
}