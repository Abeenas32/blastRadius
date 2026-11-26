import { execa } from "execa";

export type ShellResult = { exitCode: number | undefined; output: string; timedOut: boolean };

// Only these variables reach child processes (section 13). Notably NOT: ANTHROPIC_API_KEY, GITHUB_TOKEN.
const ENV_ALLOWLIST = ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP", "SystemRoot", "SHELL", "LANG"];

/** Minimal, explicit environment for test/install processes. */
export function buildChildEnv(memoryLimitMb: number): Record<string, string> {
  const env: Record<string, string> = {
    CI: "true", // turns off watch mode / interactive prompts in most tools
    NODE_OPTIONS: `--max-old-space-size=${memoryLimitMb}`, // heap cap: a safety net against accidents, not a sandbox
  };
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/** Quote one argument for a POSIX shell (this tool targets Linux/WSL, see the build doc, section 9). */
export const shellQuote = (arg: string): string => `'${arg.replace(/'/g, `'\\''`)}'`;

// Process-group ids of commands that are running right now (see killAllChildren).
const live = new Set<number>();

/** Kill a whole process group: the shell AND everything it started (test workers, servers...). */
function killGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL"); // a negative pid means "the group led by pid"
  } catch {
    /* already gone */
  }
}

/** Kill every command still running. Called on Ctrl+C so no orphans keep running (and holding ports). */
export function killAllChildren(): void {
  for (const pid of live) killGroup(pid);
  live.clear();
}

/**
 * Run a command line through the shell. Never throws on a non-zero exit (failing tests exit non-zero
 * and that is normal); the caller inspects exitCode / timedOut. stdout and stderr are merged in `output`.
 *
 * The command runs in its OWN process group (`detached`). execa's built-in timeout would only kill the
 * shell and leave its children running, so the timeout is done here by killing the whole group.
 */
export async function runShell(
  command: string,
  opts: { cwd: string; timeoutMs: number; memoryLimitMb: number },
): Promise<ShellResult> {
  const sub = execa(command, {
    shell: true,
    cwd: opts.cwd,
    env: buildChildEnv(opts.memoryLimitMb),
    extendEnv: false, // do not inherit the parent's environment
    reject: false,
    stdin: "ignore", // a child waiting for input would hang forever
    all: true,
    maxBuffer: 64 * 1024 * 1024,
    detached: true, // own process group, so it can be killed as a unit
  });
  const pid = sub.pid;
  if (pid !== undefined) {
    live.add(pid);
    // The moment the shell itself exits, kill anything it left running in the background. Otherwise such a
    // process keeps the output pipe open and `await sub` would block until the timeout, though the command is done.
    // nodeChildProcess = execa's documented escape hatch to the native process
    sub.nodeChildProcess.once("exit", () => killGroup(pid)); 
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (pid !== undefined) killGroup(pid);
  }, opts.timeoutMs);

  try {
    const result = await sub;
    return { exitCode: result.exitCode, output: String(result.all ?? ""), timedOut };
  } finally {
    clearTimeout(timer);
    if (pid !== undefined) {
      live.delete(pid);
      // also removes anything the command left running in the background
      killGroup(pid); 
    }
  }
}