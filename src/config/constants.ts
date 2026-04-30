import { env } from './env';

export const HOLD_DURATION_MS = env.HOLD_DURATION_MINUTES * 60 * 1000;

export const SEAT_PRICE_MULTIPLIERS: Record<string, number> = {
  standard: 1.0,
  premium: 1.5,
  vip: 2.0,
};

export const ROW_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
