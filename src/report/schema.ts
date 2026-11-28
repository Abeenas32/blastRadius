import { z } from "zod";

// Section 4, layer 1: the model's final answer must parse against this schema; free text is rejected.
// `classification` is deliberately NOT a field: it comes from the classifier, never from the model.
export const EvidenceRefSchema = z.object({
  evidenceId: z.string().min(1), // must exist in the run's evidence store (checked in Phase 3)
  quote: z.string().min(1), // exact text copied from that evidence entry (checked in Phase 3)
});

export const ClaimSchema = z.object({
  statement: z.string().min(1),
  evidence: z.array(EvidenceRefSchema).min(1), // one or more references per claim
});

export const RootCauseReportSchema = z.object({
  rootCause: z.object({ file: z.string().min(1), symbol: z.string().optional() }),
  summary: z.string().min(1),
  claims: z.array(ClaimSchema),
  unverified: z.array(z.string()).optional(), // suspected but unsupported
});

export type RootCauseReport = z.infer<typeof RootCauseReportSchema>;