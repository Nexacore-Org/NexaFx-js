import { normaliseName } from './name-normalisation';

describe('normaliseName', () => {
  it.each([
    ['Vladimir Putin', 'putin vladimir'],
    ['putin vladimir', 'putin vladimir'],
    ['Vladímir Pútin', 'putin vladimir'],
    ['Vladimir-Putin', 'putin vladimir'],
    ["Vladimir O'Brien", 'brien o vladimir'],
    ['  Vladimir   Putin  ', 'putin vladimir'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseName(input)).toBe(expected);
  });

  it('returns an empty string for an empty input', () => {
    expect(normaliseName('')).toBe('');
  });
});
