// One stored piece of evidence. Phase 2 adds the store and a normalized copy; the baseline only needs these.
export type EvidenceEntry = {
    // what claims cite: "diff" and "failure-log" for the baseline
    id: string;
    kind: "diff" | "failure-log" | "tool";
    // exactly what the model was shown
    raw: string; 
  };