import { z } from 'zod';

export const createScreenSchema = z.object({
  name: z.string().min(1).max(100),
  rows: z.number().int().min(1).max(26),
  seatsPerRow: z.number().int().min(1).max(50),
  rowTypeMapping: z.object({
    standard: z.array(z.string()).default([]),
    premium: z.array(z.string()).default([]),
    vip: z.array(z.string()).default([]),
  }),
});

export type CreateScreenInput = z.infer<typeof createScreenSchema>;
