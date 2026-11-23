import chalk from "chalk";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const RANK: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
let current: LogLevel = "info";

export const setLogLevel = (level: LogLevel): void => {
  current = level;
};

function emit(level: Exclude<LogLevel, "silent">, paint: (s: string) => string, msg: string, meta?: unknown): void {
  if (RANK[level] > RANK[current]) return;
  const head = `${paint(level.toUpperCase().padEnd(5))} ${msg}`;
  // stderr on purpose: stdout is reserved for the report so `--json | jq` works.
  console.error(meta === undefined ? head : `${head} ${JSON.stringify(meta)}`);
}

export const log = {
  error: (msg: string, meta?: unknown) => emit("error", chalk.red, msg, meta),
  warn: (msg: string, meta?: unknown) => emit("warn", chalk.yellow, msg, meta),
  info: (msg: string, meta?: unknown) => emit("info", chalk.cyan, msg, meta),
  debug: (msg: string, meta?: unknown) => emit("debug", chalk.gray, msg, meta),
};