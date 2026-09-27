import { z } from 'zod';

export const SEVERITIES = ['error', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ViolationSchema = z.object({
  ruleId: z.string(),
  severity: z.enum(SEVERITIES),
  message: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive().optional(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export type Violation = z.infer<typeof ViolationSchema>;

/** RFC 9457 problem details, extended with lint violations. */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  violations: z.array(ViolationSchema).optional(),
  /** On a 409 revision conflict: the page's current revision. */
  revision: z.number().int().optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;
