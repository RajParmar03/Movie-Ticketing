import { z } from 'zod';

export const reserveSchema = z.object({
  showtimeId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1).max(10),
});

export const confirmSchema = z.object({
  paymentMethod: z.enum(['card', 'upi', 'netbanking', 'wallet']),
  cardLastFour: z
    .string()
    .length(4)
    .regex(/^\d{4}$/)
    .optional(),
});

export const listBookingsQuerySchema = z.object({
  showtimeId: z.string().uuid().optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'expired']).optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const myBookingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ReserveInput = z.infer<typeof reserveSchema>;
export type ConfirmInput = z.infer<typeof confirmSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
export type MyBookingsQuery = z.infer<typeof myBookingsQuerySchema>;
