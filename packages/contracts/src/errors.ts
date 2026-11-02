import { z } from 'zod';

/** Error envelope returned by every API error response (ARCHITECTURE §9). */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
