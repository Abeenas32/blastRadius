import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLlmCache } from "../src/utils/llmCache.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cp-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createLlmCache", () => {
  it("computes once, then serves from disk (key order irrelevant)", async () => {
    const cache = createLlmCache(dir);
    let calls = 0;
    const compute = async () => ({ text: `answer ${++calls}` });

    const first = await cache.getOrCompute({ model: "m", prompt: "p" }, compute);
    const second = await cache.getOrCompute({ prompt: "p", model: "m" }, compute);

    expect(first).toEqual({ value: { text: "answer 1" }, hit: false });
    expect(second).toEqual({ value: { text: "answer 1" }, hit: true });
    expect(calls).toBe(1);
  });
});