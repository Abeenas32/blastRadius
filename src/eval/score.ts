import type { Classification } from "../classifier/types.js";

// Pure scoring functions: no I/O, trivially unit-testable.

export type CaseResult = {
  caseId: string;
  source: "real" | "injected";
  // 0-based run index (LLM runs differ; the classifier part is deterministic)
  run: number;
  expected: Classification;
  // ERROR = the case could not be run (it is dropped and reported)
  actual: Classification | "ERROR"; 
  // labelled root-cause file, if the case has one
  expectedFile: string | undefined;
  // what config A answered; undefined when it gave no valid answer
  predictedFile: string | undefined;
  baselineAttempted: boolean;
  // did config A return schema-valid JSON?
  validOutput: boolean; 
  costUsd: number;
  ms: number;
  error: string | undefined;
};

export type Ratio = { correct: number; total: number; pct: number };
const ratio = (correct: number, total: number): Ratio => ({ correct, total, pct: total === 0 ? 0 : (100 * correct) / total });

// "./src\\a.ts" and "src/a.ts" are the same file.
export const normalizePath = (p: string): string => p.replace(/\\/g, "/").replace(/^\.\//, "").trim();

/** Classification accuracy (config B). Cases that errored are excluded and counted separately as dropped. */
export function classificationAccuracy(results: readonly CaseResult[]): Ratio {
  const ran = results.filter((r) => r.actual !== "ERROR");
  return ratio(ran.filter((r) => r.actual === r.expected).length, ran.length);
}

/** Root-cause accuracy of config A: predicted file equals the labelled file. Invalid output counts as wrong. */
export function rootCauseAccuracy(results: readonly CaseResult[]): Ratio {
  const scored = results.filter((r) => r.baselineAttempted && r.expectedFile !== undefined);
  const correct = scored.filter(
    (r) => r.predictedFile !== undefined && normalizePath(r.predictedFile) === normalizePath(r.expectedFile!),
  );
  return ratio(correct.length, scored.length);
}

export const droppedCases = (results: readonly CaseResult[]): string[] => [
  ...new Set(results.filter((r) => r.actual === "ERROR").map((r) => r.caseId)),
];

export const totalCost = (results: readonly CaseResult[]): number => results.reduce((sum, r) => sum + r.costUsd, 0);

/** Mean and range of a per-run metric across runs (the final table reports mean and range, section 6.4). */
export function acrossRuns(results: readonly CaseResult[], metric: (rs: readonly CaseResult[]) => Ratio) {
  const runs = [...new Set(results.map((r) => r.run))].sort((a, b) => a - b);
  const pcts = runs.map((run) => metric(results.filter((r) => r.run === run)).pct);
  if (pcts.length === 0) return { mean: 0, min: 0, max: 0, runs: 0 };
  return { mean: pcts.reduce((a, b) => a + b, 0) / pcts.length, min: Math.min(...pcts), max: Math.max(...pcts), runs: pcts.length };
}

const fmt = (r: Ratio): string => `${r.pct.toFixed(1)}% (${r.correct}/${r.total})`;

/** Plain-text summary. Real and injected are ALWAYS reported separately (section 6.1). Case counts sit next to every number. */
export function formatSummary(results: readonly CaseResult[]): string {
  const lines: string[] = [];
  for (const source of ["real", "injected"] as const) {
    const rs = results.filter((r) => r.source === source);
    if (rs.length === 0) continue;
    const range = acrossRuns(rs, rootCauseAccuracy);
    const rc = rootCauseAccuracy(rs);
    lines.push(
      `[${source}] classification (B): ${fmt(classificationAccuracy(rs.filter((r) => r.run === 0)))}`,
      `[${source}] root cause, naive baseline (A): ${rc.total === 0 ? "n/a" : `${range.mean.toFixed(1)}% mean over ${range.runs} run(s), range ${range.min.toFixed(1)}-${range.max.toFixed(1)}%`}`,
    );
  }
  const dropped = droppedCases(results);
  lines.push(`dropped cases: ${dropped.length}${dropped.length ? ` (${dropped.join(", ")})` : ""}`);
  lines.push(`model cost at list price (cached calls were not charged again): $${totalCost(results).toFixed(4)}`);
  return lines.join("\n");
}