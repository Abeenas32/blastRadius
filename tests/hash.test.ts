import { describe, expect, it } from "vitest";
import { hashRequest, stableStringify } from "../src/utils/hash.js";

describe("hashRequest", () => {
  it("ignores key order, so equal requests share a cache key", () => {
    expect(hashRequest({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(hashRequest({ b: { d: [1, 2], c: 2 }, a: 1 }));
  });
  it("differs when content differs, and array order matters", () => {
    expect(hashRequest({ a: [1, 2] })).not.toBe(hashRequest({ a: [2, 1] }));
  });
  it("drops undefined fields", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});