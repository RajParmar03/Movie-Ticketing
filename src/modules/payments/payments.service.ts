// Payments are created inline within booking.service.ts (confirm flow).
// This module is a placeholder for future integration with a real payment gateway.

export const paymentsService = {
  generateTransactionId(): string {
    return `TXN-${crypto.randomUUID()}`;
  },
};
