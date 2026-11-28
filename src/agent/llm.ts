import { z } from "zod";
import { llmError } from "../utils/error.js";

// The ONLY file that talks to the model provider (section 9). Plain fetch: no SDK, no classes.
// Anything that needs a model takes a `CompleteFn`, so tests pass a fake and never spend money.

export type LlmRequest = {
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  // part of the cache key: run 2 and 3 must NOT be served run 1's cached answer
  runIndex: number; 
};
export type LlmResponse = { text: string; inputTokens: number; outputTokens: number };
export type CompleteFn = (req: LlmRequest) => Promise<LlmResponse>;

const ApiResponse = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 529]);

/** Build a CompleteFn bound to an API key. Retries rate-limit / overload errors with exponential backoff. */
export function createAnthropicComplete(opts: {
  apiKey: string;
  fetchFn?: typeof fetch | undefined;
  maxRetries?: number | undefined;
  baseDelayMs?: number | undefined;
}): CompleteFn {
  const doFetch = opts.fetchFn ?? fetch;
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;

  return async (req) => {
    const body = JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: 0, // as repeatable as the API allows (UNVERIFIED against the live API: delete if rejected)
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    });

    for (let attempt = 0; ; attempt++) {
      const res = await doFetch("okokk", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
        body,
      });

      if (res.ok) {
        const parsed = ApiResponse.safeParse(await res.json());
        if (!parsed.success) throw llmError("Unexpected response shape from the Anthropic API");
        const text = parsed.data.content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");
        return { text, inputTokens: parsed.data.usage.input_tokens, outputTokens: parsed.data.usage.output_tokens };
      }
      if (RETRYABLE.has(res.status) && attempt < maxRetries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      throw llmError(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  };
}