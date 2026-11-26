import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";    
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { workSpaceError } from "../utils/error.js";
import { killAllChildren } from "../utils/exec.js";
import { log } from "../utils/logger.js";

// Worktrees live in the OS temp dir on purpose: a worktree inside the user's project would inherit that
// project's node_modules through Node's parent-directory lookup and hide missing dependencies.
export const worktreeRoot = (): string => join(tmpdir(), "changepilot-worktrees");

const git = (dir: string) => simpleGit({ baseDir: dir });

// worktree path -> the repo it belongs to. Module-level so Ctrl+C can clean up whatever is still open.
const active = new Map<string, string>();

/** `git worktree add --detach`: a checkout of `sha` in its own folder, sharing the repo's object store. */
export async function addWorktree(repoDir: string, sha: string, label: string): Promise<string> {
  const path = join(worktreeRoot(), `${randomUUID().slice(0, 8)}-${label}`);
  await mkdir(worktreeRoot(), { recursive: true });
  try {
    await git(repoDir).raw(["worktree", "add", "--detach", path, sha]);
  } catch (err) {
    throw workSpaceError(`Could not create worktree for ${sha}: ${(err as Error).message}`, { cause: err });
  }
  active.set(path, repoDir);
  return path;
}

/** Remove a worktree. Best effort at every step so cleanup itself never throws. */
export async function removeWorktree(path: string): Promise<void> {
  const repoDir = active.get(path);
  active.delete(path);
  if (repoDir) await git(repoDir).raw(["worktree", "remove", "--force", path]).catch(() => undefined);
  await rm(path, { recursive: true, force: true }); // covers the case where git could not remove it
  if (repoDir) await git(repoDir).raw(["worktree", "prune"]).catch(() => undefined);
}

let handlersInstalled = false;

/**
 * On Ctrl+C / SIGTERM, remove open worktrees before exiting (`finally` blocks do not run on a signal).
 * Uses `process.on`, NOT `once`: a `once` listener unregisters itself as it fires, and the exit-cleanup hook
 * inside execa then sees "nobody handles this signal" and kills the process in the middle of our cleanup.
 */
function installSignalHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  let cleaning = false; // a second Ctrl+C while cleaning must not start a second cleanup
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    process.on(signal, () => {
      if (cleaning) return;
      cleaning = true;
      log.warn(`${signal}: stopping running commands and removing worktrees before exit`);
      killAllChildren(); // first stop anything still running inside the worktrees
      void Promise.all([...active.keys()].map(removeWorktree)).finally(() => process.exit(code));
    });
  }
}

/**
 * Create the baseline and PR worktrees, run `fn`, and ALWAYS remove both (finally), even if `fn` throws.
 * If creating the second worktree fails, the first is still cleaned up.
 */
export async function withWorktrees<T>(
  repoDir: string,
  shas: { baseline: string; pr: string },
  fn: (paths: { baseline: string; pr: string }) => Promise<T>,
): Promise<T> {
  installSignalHandlers();
  const created: string[] = [];
  try {
    const baseline = await addWorktree(repoDir, shas.baseline, "base");
    created.push(baseline);
    const pr = await addWorktree(repoDir, shas.pr, "pr");
    created.push(pr);
    return await fn({ baseline, pr });
  } finally {
    await Promise.all(created.map(removeWorktree));
  }
}

/** `changepilot clean`: delete leftovers from crashed runs and prune git's records. Returns how many folders went. */
export async function cleanLeftovers(repoDir?: string): Promise<number> {
  const entries = await readdir(worktreeRoot()).catch(() => [] as string[]);
  await rm(worktreeRoot(), { recursive: true, force: true });
  if (repoDir) await git(repoDir).raw(["worktree", "prune"]).catch(() => undefined);
  return entries.length;
}

