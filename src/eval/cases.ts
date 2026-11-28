import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CLASSIFICATIONS, needsInvestigation } from "../classifier/types.js";
import { ConfigOverridesSchema } from "../config/schema.js";
import { evalError } from "../utils/error.js";

// One labelled case (section 6.1) plus an optional `config` block: every real repo installs and tests
// differently, so a single global config cannot fit 12 different repositories.
export const CaseSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(["real", "injected"]),
    repo: z.string().min(1), // "owner/name", a full git URL, or a local path
    baseSha: z.string().min(7), // base-branch commit; the baseline is merge-base(baseSha, prSha)
    prSha: z.string().min(7),
    expectedClassification: z.enum(CLASSIFICATIONS),
    rootCauseFile: z.string().optional(),
    rootCauseSymbol: z.string().optional(),
    rootCauseInDiff: z.boolean(),
    failingTests: z.array(z.string()),
    notes: z.string(),
    config: ConfigOverridesSchema.optional(),
  })
  .strict()
  .refine((c) => !needsInvestigation(c.expectedClassification) || c.rootCauseFile !== undefined, {
    message: "rootCauseFile is required when the expected classification needs investigation",
  });

export type EvalCase = z.infer<typeof CaseSchema>;

/** Load and validate every *.json in `dir`. Collects ALL problems before failing so you fix them in one pass. */
export async function loadCases(dir: string): Promise<EvalCase[]> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort();
  if (names.length === 0) throw evalError(`No case files (*.json) found in ${dir}`);

  const cases: EvalCase[] = [];
  const problems: string[] = [];
  for (const name of names) {
    try {
      const parsed = CaseSchema.safeParse(JSON.parse(await readFile(join(dir, name), "utf8")));
      if (parsed.success) cases.push(parsed.data);
      else problems.push(`${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`);
    } catch (err) {
      problems.push(`${name}: ${(err as Error).message}`);
    }
  }
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) problems.push(`duplicate case id "${c.id}"`);
    seen.add(c.id);
  }
  if (problems.length > 0) throw evalError(`Invalid eval cases:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  return cases;
}