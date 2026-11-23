
const ANSI = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const PORT = /(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+/g;
const DURATION = /\b\d+(?:\.\d+)?\s?(?:ms|s)\b/g;
const HEX_ID = /\b[0-9a-f]{7,64}\b/gi;

export const stripAnsi = (text: string): string => text.replace(ANSI, "");
export const normalizePathSeparators = (text: string): string => text.replace(/\\/g, "/");
export const collapseWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Verifier: strip ANSI, unify path separators, collapse whitespace. */
export const normalizeForMatch = (text: string): string =>
  collapseWhitespace(normalizePathSeparators(stripAnsi(text)));

/**
 * Classifier: everything above, plus remove run-specific noise so that two runs of the
 * same failure compare equal. `roots` are absolute worktree paths to rewrite as repo-relative.
 * Numbers in assertions ("expected 5, got 6") are deliberately kept: those are the signal.
 */
export function normalizeFailure(text: string, roots: readonly string[] = []): string {
  let out = normalizePathSeparators(stripAnsi(text));

  const cleanRoots = roots
    .map((r) => normalizePathSeparators(r).replace(/\/+$/, ""))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first so nested roots don't half-match
  for (const root of cleanRoots) out = out.split(`${root}/`).join("");

  out = out
    .replace(TIMESTAMP, "<ts>")
    .replace(UUID, "<uuid>")
    .replace(PORT, "$1:<port>")
    .replace(DURATION, "<dur>")
    // only treat a hex run as a hash if it mixes digits and letters (skips "1234567" and "defaced")
    .replace(HEX_ID, (m) => (/\d/.test(m) && /[a-f]/i.test(m) ? "<hash>" : m));

  return collapseWhitespace(out);
}