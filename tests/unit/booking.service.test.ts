import { AppError } from '../../src/utils/AppError';
import { generateReference } from '../../src/utils/generateReference';

// ── generateReference ────────────────────────────────────────────────────────

describe('generateReference', () => {
  it('starts with BK- prefix', () => {
    expect(generateReference()).toMatch(/^BK-/);
  });

  it('has the correct default length (BK- + 8 chars = 11)', () => {
    expect(generateReference()).toHaveLength(11);
  });

  it('uses only uppercase alphanumeric characters after the prefix', () => {
    const ref = generateReference().slice(3);
    expect(ref).toMatch(/^[A-Z0-9]+$/);
  });

  it('generates unique references (probabilistic)', () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateReference()));
    expect(refs.size).toBe(100);
  });
});

// ── AppError ─────────────────────────────────────────────────────────────────

describe('AppError', () => {
  it('constructs with correct properties', () => {
    const err = new AppError(409, 'SEAT_UNAVAILABLE', 'Seats are taken.', [{ field: 'seatIds' }]);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('SEAT_UNAVAILABLE');
    expect(err.message).toBe('Seats are taken.');
    expect(err.details).toHaveLength(1);
  });

  it('is an instance of Error', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Not found.');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('defaults details to empty array', () => {
    const err = new AppError(500, 'INTERNAL_ERROR', 'Oops.');
    expect(err.details).toEqual([]);
  });
});
