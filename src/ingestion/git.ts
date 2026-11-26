import { simpleGit } from "simple-git";
import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ingestionError } from "../utils/error.js";

const git = (dir: string) => simpleGit({ baseDir: dir });

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

export const resolveRepoUrl = (repo: string): string =>
  /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}.git` : repo;

export async function ensureClone(
  repo: string,
  destDir: string,
): Promise<void> {
  if (await exists(join(destDir, ".git"))) return;
  await mkdir(destDir, { recursive: true });
  try {
    await simpleGit().clone(resolveRepoUrl(repo), destDir);
  } catch (err) {
    throw ingestionError(`Could not clone ${repo}: ${(err as Error).message}`, {
      cause: err,
    });
  }
}

/** Make sure `sha` exists locally; if not, fetch it from origin by SHA. */
export async function ensureCommit(repoDir: string, sha: string): Promise<void> {
    try {
      await git(repoDir).raw(["cat-file", "-e", `${sha}^{commit}`]); // exits non-zero when missing
    } catch {
      try {
        await git(repoDir).raw(["fetch", "--quiet", "origin", sha]);
      } catch (err) {
        throw ingestionError(`Commit ${sha} not found locally or on origin`, { cause: err });
      }
    }
  }
  
  /** Fetch refs/pull/N/head (works for fork PRs too) into a private ref and return its SHA. */
  export async function fetchPrHead(repoDir: string, prNumber: number): Promise<string> {
    const ref = `refs/changepilot/pr-${prNumber}`;
    await git(repoDir).raw(["fetch", "--quiet", "origin", `+refs/pull/${prNumber}/head:${ref}`]);
    return (await git(repoDir).revparse([ref])).trim();
  }
  
  /** Fetch the base branch tip from origin and return its SHA. */
  export async function fetchBranchTip(repoDir: string, branch: string): Promise<string> {
    const ref = `refs/remotes/origin/${branch}`;
    await git(repoDir).raw(["fetch", "--quiet", "origin", `+refs/heads/${branch}:${ref}`]);
    return (await git(repoDir).revparse([ref])).trim();
  }
  
  /** The commit where the PR branched off. This, not the base tip, is the baseline (section 3). */
  export async function mergeBase(repoDir: string, a: string, b: string): Promise<string> {
    try {
      return (await git(repoDir).raw(["merge-base", a, b])).trim();
    } catch (err) {
      throw ingestionError(`No merge-base between ${a} and ${b}`, { cause: err });
    }
  }
  
  /** Unified diff of what the PR changed relative to the baseline commit. */
  export const getDiffText = (repoDir: string, baseline: string, head: string): Promise<string> =>
    // quotepath=false keeps non-ASCII file names readable instead of "\303\251"-escaped
    git(repoDir).raw(["-c", "core.quotepath=false", "diff", "--no-color", "--no-ext-diff", baseline, head]);
  
  /** `git remote get-url origin`, or undefined when there is no origin. */
  export async function getOriginUrl(repoDir: string): Promise<string | undefined> {
    try {
      return (await git(repoDir).raw(["remote", "get-url", "origin"])).trim();
    } catch {
      return undefined;
    }
  }