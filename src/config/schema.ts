import { z } from "zod";
import { configError } from "../utils/error.js";

// Pinned models: reported numbers use exactly these (section 6.4). Defined once.
const DEFAULT_MODELS = { agent: "claude-sonnet-5-5", entailment: "claude-haiku-5-5" };

export const ConfigSchema = z
  .object({
    baseBranch: z.string().default("main"),
    installCommand: z.string().default("npm ci"),
    testCommand: z.string().min(1, "testCommand is required"), // BASE command; reporter flags are appended
    reporter: z.enum(["jest", "vitest"]),
    parallel: z.boolean().default(false), // sequential unless the repo declares tests parallel-safe
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

    installTimeoutMs: z.number().int().positive().default(15 * 60_000),
    rerunCount: z.number().int().nonnegative().default(3), // section 5: 3 reruns at each commit

    // Prompt-size limits for the naive baseline (config A)
    maxDiffChars: z.number().int().positive().default(60_000),
    maxLogChars: z.number().int().positive().default(20_000),

    // USD per million tokens, per model. Deliberately NO defaults: copy the current numbers from
    // Anthropic's pricing page. The eval refuses to spend money without them (budget guard, K9).
    pricingUsdPerMTok: z
      .record(z.string(), z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() }))
      .default({}),

    workDir: z.string().default(".changepilot"), // clones of eval repos live under <workDir>/repos
    cacheDir: z.string().default(".changepilot/llm-cache"),
    budgetUsd: z.number().positive().default(50),
  })
  .strict(); // typos like "maxIteration" fail loudly instead of being silently ignored

export type Config = z.infer<typeof ConfigSchema>;

// A case may override the few settings that differ per repository (each real repo installs/tests differently).
export const ConfigOverridesSchema = ConfigSchema.pick({
  installCommand: true,
  testCommand: true,
  reporter: true,
  baseBranch: true,
}).partial();
export type ConfigOverrides = z.infer<typeof ConfigOverridesSchema>;

/** Apply only the overrides that are actually set (an explicit `undefined` must not erase a value). */
export function applyOverrides(base: Config, overrides: ConfigOverrides | undefined): Config {
  if (!overrides) return base;
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined));
  return { ...base, ...defined };
}

/** Pure validation, kept separate from file loading so it is trivial to unit-test. */
export function parseConfig(raw: unknown, source = "config"): Config {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) return result.data;
  const problems = result.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw configError(`Invalid ${source}:\n${problems}`);
}