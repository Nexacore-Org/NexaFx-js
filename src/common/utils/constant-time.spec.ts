import { constantTimeEquals } from './constant-time';

describe('constantTimeEquals', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEquals('a'.repeat(64), 'a'.repeat(64))).toBe(true);
  });

  it('rejects a near-miss that differs by one character', () => {
    const token = 'a'.repeat(63) + 'b';
    expect(constantTimeEquals('a'.repeat(64), token)).toBe(false);
  });

  it('rejects strings of different length without throwing', () => {
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
    expect(constantTimeEquals('', 'abc')).toBe(false);
  });
});
