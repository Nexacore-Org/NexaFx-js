import { jaroWinkler } from './jaro-winkler';

describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('putin vladimir', 'putin vladimir')).toBe(1);
  });

  it('returns 0 when neither string has a match', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
    expect(jaroWinkler('', 'vladimir')).toBe(0);
  });

  it('applies the prefix bonus for transpositions near the start', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.9611, 3);
  });

  it('scores a one-character near miss below the default 0.92 threshold', () => {
    expect(jaroWinkler('putinkin vladimir', 'putin vladimir')).toBeLessThan(
      0.92,
    );
  });

  it('scores a short prefix-only candidate below the default threshold', () => {
    expect(jaroWinkler('al', 'ali')).toBeLessThan(0.92);
  });
});
