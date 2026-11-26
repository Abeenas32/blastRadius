import { z } from "zod";
import { normalizeFailure, stripAnsi, stripStackFrames } from "../../utils/normalize.js"
import type { TestResult } from "../types.js";
// Jest and Vitest write the same JSON shape for everything we use (verified against real output of both),
// so one parser serves both reporters.
const ReportSchema = z.object({
  testResults: z.array(
    z.object({
      name: z.string(), // absolute path of the test file
      status: z.string().optional(),
      message: z.string().optional(), // set when the whole file failed to load
      assertionResults: z
        .array(
          z.object({
            fullName: z.string().optional(),
            title: z.string().optional(),
            ancestorTitles: z.array(z.string()).optional(),
            status: z.string(), // passed | failed | pending | skipped | todo ...
            failureMessages: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    }),
  ),
});

/** Strip the worktree prefix so ids are identical at both commits ("/tmp/x-base/src/a.ts" -> "src/a.ts"). */
function toRepoRelative(file: string, roots: readonly string[]): string {
  const f = file.replace(/\\/g, "/");
  for (const raw of roots) {
    const root = raw.replace(/\\/g, "/").replace(/\/+$/, "");
    if (f.startsWith(`${root}/`)) return f.slice(root.length + 1);
  }
  return f;
}

/**
 * Parse the JSON report text. Returns undefined when it is not a valid report
 * (the runner then treats the run as "suite failed to start").
 */
export function parseJestLikeReport(jsonText: string, roots: readonly string[]): TestResult[] | undefined {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return undefined;
  }
  const parsed = ReportSchema.safeParse(data);
  if (!parsed.success) return undefined;

  // Same id twice in one run (duplicate test titles): merge, "failed" wins, so one run gives one observation.
  const byId = new Map<string, TestResult>();
  const add = (r: TestResult): void => {
    const prev = byId.get(r.id);
    if (!prev || (prev.status !== "failed" && r.status === "failed") || prev.status === "skipped") byId.set(r.id, r);
  };

  for (const suite of parsed.data.testResults) {
    const file = toRepoRelative(suite.name, roots);
    const assertions = suite.assertionResults ?? [];

    // A file that could not even load (syntax error, missing import) has no assertions. Record it as one
    // failed pseudo-test, otherwise a PR that breaks an import would look like "no failures".
    if (assertions.length === 0 && suite.status === "failed") {
      const raw = stripAnsi(suite.message ?? "");
      add({
        id: `${file} :: <suite failed to run>`,
        file,
        status: "failed",
        failure: normalizeFailure(stripStackFrames(raw), roots),
        rawFailure: raw,
      });
      continue;
    }

    for (const a of assertions) {
      const name = a.fullName ?? [...(a.ancestorTitles ?? []), a.title ?? ""].join(" ").trim();
      const status = a.status === "passed" ? "passed" : a.status === "failed" ? "failed" : "skipped";
      const raw = status === "failed" ? stripAnsi((a.failureMessages ?? []).join("\n")) : "";
      add({
        id: `${file} :: ${name}`,
        file,
        status,
        failure: status === "failed" ? normalizeFailure(stripStackFrames(raw), roots) : "",
        rawFailure: raw,
      });
    }
  }
  return [...byId.values()];
}