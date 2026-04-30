import { SEAT_PRICE_MULTIPLIERS } from '../config/constants';

export function calculatePrice(basePrice: number, seatType: string): number {
  const multiplier = SEAT_PRICE_MULTIPLIERS[seatType] ?? 1.0;
  return Math.round(basePrice * multiplier * 100) / 100;
}
