import { describe, expect, it } from "vitest";
import { normalizeFailure, normalizeForMatch, stripAnsi } from "../src/utils/normalize.js";

describe("normalizeForMatch", () => {
  it("strips ANSI codes", () => {
    expect(stripAnsi("\u001b[31mFAIL\u001b[0m x")).toBe("FAIL x");
  });
  it("unifies path separators and collapses whitespace", () => {
    expect(normalizeForMatch("at src\\a\\b.ts   line\n\n 3")).toBe("at src/a/b.ts line 3");
  });
});

describe("normalizeFailure", () => {
  it("makes the same failure from two worktrees/runs compare equal", () => {
    const a = "Error at /tmp/wt-base/src/x.ts:10 on 2026-11-22T10:00:00.123Z localhost:3001 (12 ms)";
    const b = "Error at /tmp/wt-pr/src/x.ts:10 on 2026-11-23T09:15:44Z localhost:4002 (340 ms)";
    expect(normalizeFailure(a, ["/tmp/wt-base"])).toBe(normalizeFailure(b, ["/tmp/wt-pr"]));
  });
  it("handles Windows-style roots", () => {
    expect(normalizeFailure("C:\\wt\\a\\src\\x.ts failed", ["C:\\wt\\a"])).toBe("src/x.ts failed");
  });
  it("replaces uuids and mixed hex ids but keeps plain numbers and words", () => {
    const out = normalizeFailure("id 3f2504e0-4f89-11d3-9a0c-0305e82c3301 sha a1b2c3d4e5 count 1234567 word defaced");
    expect(out).toBe("id <uuid> sha <hash> count 1234567 word defaced");
  });
  it("does NOT merge genuinely different assertion failures", () => {
    expect(normalizeFailure("expected 5, received 6")).not.toBe(normalizeFailure("expected 5, received 7"));
  });
});