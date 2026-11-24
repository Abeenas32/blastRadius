import { z } from "zod";
import  {configError } from "../utils/error.js";

// Pinned models: reported numbers use exactly these (section 6.4). Defined once.
const DEFAULT_MODELS = { agent: "claude-sonnet-5-5", entailment: "claude-haiku-5-5" };

export const ConfigSchema = z
  .object({
    baseBranch: z.string().default("main"),
    installCommand: z.string().default("npm ci"),
    testCommand: z.string().min(1, "testCommand is required"),
    reporter: z.enum(["jest", "vitest"]),
    // sequential unless the repo declares tests parallel-safe
    parallel: z.boolean().default(false), 
    testTimeoutMs: z.number().int().positive().default(10 * 60_000),
    memoryLimitMb: z.number().int().positive().default(4096),

    // Agent limits (section 13)
    maxIterations: z.number().int().positive().default(12),
    maxRetries: z.number().int().nonnegative().default(2),
    maxClusters: z.number().int().positive().default(3),

    models: z
      .object({
        agent: z.string().default(DEFAULT_MODELS.agent),
        entailment: z.string().default(DEFAULT_MODELS.entailment),
      })
      .default(DEFAULT_MODELS),

    cacheDir: z.string().default(".changepilot/llm-cache"),
    budgetUsd: z.number().positive().default(50),
  })
  // typos like "maxIteration" fail loudly instead of being silently ignored
  .strict(); 

export type Config = z.infer<typeof ConfigSchema>;

/** Pure validation, kept separate from file loading so it is trivial to unit-test. */
export function parseConfig(raw: unknown, source = "config"): Config {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) return result.data;
  const problems = result.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw configError(`Invalid ${source}:\n${problems}`);
}