/* // Small text helpers shared by the runner, the diff code and the baseline prompt.
// text-trimming helpers used to keep prompts, diffs, and test logs within size limits without losing critical context. */

/** Last `max` characters. Error output usually carries the useful part at the end. */
export const tail = (s: string, max: number): string => (s.length <= max ? s : s.slice(s.length - max));

/**
 * Visible truncation marker. The Phase 3 citation verifier must refuse quotes that span it,
 * so it is defined once, here.
 */
export const TRUNCATION_MARKER = "[...TRUNCATED";

/** Cut `text` to about `max` chars, preferring a line boundary, and say how much was dropped. */
export function truncateWithMarker(text: string, max: number): string {
  if (text.length <= max) return text;
  const lineEnd = text.lastIndexOf("\n", max);
  // Only use the line boundary if it does not throw away more than half of the budget.
  const head = text.slice(0, lineEnd > max * 0.5 ? lineEnd : max);
  return `${head}\n${TRUNCATION_MARKER}: ${text.length - head.length} chars omitted]\n`;
}