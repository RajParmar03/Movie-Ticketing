import { calculatePrice } from '../../src/utils/pricing';

describe('calculatePrice', () => {
  it('applies 1.0x multiplier for standard seats', () => {
    expect(calculatePrice(200, 'standard')).toBe(200);
    expect(calculatePrice(150.5, 'standard')).toBe(150.5);
  });

  it('applies 1.5x multiplier for premium seats', () => {
    expect(calculatePrice(200, 'premium')).toBe(300);
    expect(calculatePrice(100, 'premium')).toBe(150);
  });

  it('applies 2.0x multiplier for vip seats', () => {
    expect(calculatePrice(200, 'vip')).toBe(400);
    expect(calculatePrice(50, 'vip')).toBe(100);
  });

  it('defaults to 1.0x multiplier for unknown seat types', () => {
    expect(calculatePrice(200, 'unknown')).toBe(200);
  });

  it('rounds to 2 decimal places', () => {
    expect(calculatePrice(100.333, 'premium')).toBe(150.5);
  });
});
