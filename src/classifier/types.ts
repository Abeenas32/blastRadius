// Section 5. These labels are assigned ONLY by the deterministic classifier; the agent never changes them.
export const CLASSIFICATIONS = [
    "NO_ISSUE",
    "FIXED_BY_PR",
    "PRE_EXISTING",
    "PRE_EXISTING_FLAKY",
    "ENV_PRE_EXISTING",
    "TEST_REMOVED",
    "BASELINE_UNAVAILABLE",
    "REGRESSION",
    "DETERMINISM_REGRESSION",
    "CHANGED_FAILURE",
    "NEW_TEST_FAILS",
    "ENV_BROKEN_BY_PR",
  ] as const;
  
  export type Classification = (typeof CLASSIFICATIONS)[number];
  
  // Labels that go to the LLM investigation; everything else is reported straight away.
  const INVESTIGATE: ReadonlySet<Classification> = new Set([
    "REGRESSION",
    "DETERMINISM_REGRESSION",
    "CHANGED_FAILURE",
    "NEW_TEST_FAILS",
    "ENV_BROKEN_BY_PR",
  ]);
  export const needsInvestigation = (c: Classification): boolean => INVESTIGATE.has(c);
  
  export type TestVerdict = { id: string; classification: Classification };
  
  export type ClassifiedRun = {
      // the single label for the whole PR (see SEVERITY in classify.ts)
    overall: Classification;
    // one human-readable line explaining `overall`
    reason: string; 
    // every test that is NOT NO_ISSUE
    tests: TestVerdict[]; 
    counts: Record<Classification, number>;
  };