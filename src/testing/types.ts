// One test in one run. `id` is "<repo-relative file> :: <full test name>" (section 5).
export type TestResult = {
    id: string;
    file: string;
    status: "passed" | "failed" | "skipped";
    failure: string; // normalized text used for "same failure?" comparison; "" unless failed
    rawFailure: string; // readable text (ANSI stripped, stack kept) for the LLM prompt; "" unless failed
  };
  
  // One execution of the suite (or of a few files).
  export type SuiteRun =
    | { kind: "ran"; results: TestResult[] }
    // The runner produced no readable report (broken config, missing module at load, timeout...).
    | { kind: "start_error"; signature: string; output: string };
  
  // What the classifier needs to know about one test at one commit: how it behaved in each run.
  export type Observation = { status: "passed" | "failed"; failure: string };
  
  // What the classifier sees for one whole commit.
  export type CommitView =
    | { state: "unavailable"; reason: string } // could not be set up (e.g. install failed)
    | { state: "start_error"; signature: string } // set up fine, but the suite would not start
    | { state: "ran"; tests: Map<string, Observation[]> }; // test id -> its runs (1 run, or 1 + reruns)