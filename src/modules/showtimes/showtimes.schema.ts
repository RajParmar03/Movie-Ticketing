import { z } from 'zod';

export const createShowtimeSchema = z.object({
  movieId: z.string().uuid(),
  screenId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  basePrice: z.number().positive(),
});

export const listShowtimesQuerySchema = z.object({
  movieId: z.string().uuid().optional(),
  screenId: z.string().uuid().optional(),
  date: z.string().date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateShowtimeInput = z.infer<typeof createShowtimeSchema>;
export type ListShowtimesQuery = z.infer<typeof listShowtimesQuerySchema>;
