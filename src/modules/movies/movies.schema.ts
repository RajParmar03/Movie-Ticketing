import { z } from 'zod';

export const createMovieSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  genre: z.string().min(1).max(100),
  language: z.string().min(1).max(100),
  durationMinutes: z.number().int().positive(),
  rating: z.enum(['U', 'UA', 'A']),
  releaseDate: z.string().date(),
  posterUrl: z.string().url().optional(),
  isActive: z.boolean().default(true),
});

export const updateMovieSchema = createMovieSchema.partial();

export const listMoviesQuerySchema = z.object({
  genre: z.string().optional(),
  language: z.string().optional(),
  rating: z.enum(['U', 'UA', 'A']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['releaseDate', 'title']).default('releaseDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateMovieInput = z.infer<typeof createMovieSchema>;
export type UpdateMovieInput = z.infer<typeof updateMovieSchema>;
export type ListMoviesQuery = z.infer<typeof listMoviesQuerySchema>;
