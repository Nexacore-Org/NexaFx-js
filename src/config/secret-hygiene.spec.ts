import { readFileSync } from 'fs';
import { join } from 'path';
import {
  checkSecretHygiene,
  isLowEntropySecret,
  KNOWN_PLACEHOLDER_SECRETS,
  STRONG_SECRET_KEYS,
} from './secret-hygiene';

describe('secret hygiene (issue #1543)', () => {
  describe('isLowEntropySecret', () => {
    it.each([
      ['repeated character', 'a'.repeat(32)],
      ['sequential hex example key', '0123456789abcdef'.repeat(4)],
      ['short repeating unit', 'abcabcabcabcabcabcabcabcabcabcabc'],
      ['few distinct characters', 'abababab12121212abababab12121212'],
    ])('flags %s', (_label, value) => {
      expect(isLowEntropySecret(value)).toBe(true);
    });

    it('accepts a random-looking value', () => {
      expect(isLowEntropySecret('9f3b7c1d5e8a2406b1d7c93e4f5a608c2d1e7b9a3c5f4e6d8b0a1c2d3e4f5a6b')).toBe(false);
    });
  });

  describe('checkSecretHygiene', () => {
    const strong = {
      JWT_SECRET: 'q8Zr3vKx1LmN7pTd5WcY2bHj9sFg4uAe',
      REFRESH_TOKEN_SECRET: 'Hn6Vb2Xc8Zq4Mw1Ke7Rt3Yu9Pi5Lo0As',
      OTP_SECRET: 'Tg4Jk8Df2Sa6Qw1Er7Ty3Ui9Op5Zx0Cv',
      PROVIDER_WEBHOOK_SECRET: 'Bn5Mk9Lj3Hg7Fd1Sa4Pq8Wo2Ei6Ru0Yt',
      WALLET_ENCRYPTION_KEY: '9f3b7c1d5e8a2406b1d7c93e4f5a608c2d1e7b9a3c5f4e6d8b0a1c2d3e4f5a6b',
    };

    it('passes distinct, high-entropy secrets', () => {
      expect(checkSecretHygiene(strong)).toEqual({ errors: [], productionErrors: [] });
    });

    it('reports the same value used for two secrets', () => {
      const { errors } = checkSecretHygiene({ ...strong, REFRESH_TOKEN_SECRET: strong.JWT_SECRET });
      expect(errors).toEqual([expect.stringContaining('REFRESH_TOKEN_SECRET: must differ from JWT_SECRET')]);
    });

    it('reports published placeholders as production errors', () => {
      const { productionErrors } = checkSecretHygiene({
        ...strong,
        JWT_SECRET: 'change-me-to-a-long-random-string',
      });
      expect(productionErrors).toEqual([expect.stringContaining('JWT_SECRET: is a placeholder')]);
    });

    it('reports the sequential example wallet key', () => {
      const { productionErrors } = checkSecretHygiene({
        ...strong,
        WALLET_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
      });
      expect(productionErrors).toHaveLength(1);
    });
  });

  it('knows every secret placeholder published in .env.example (cannot drift)', () => {
    const example = readFileSync(join(__dirname, '..', '..', '.env.example'), 'utf8');
    const values = new Map<string, string[]>();
    for (const match of example.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)) {
      values.set(match[1], [...(values.get(match[1]) ?? []), match[2].trim()]);
    }

    for (const key of STRONG_SECRET_KEYS) {
      const published = values.get(key) ?? [];
      // A second assignment would silently override the first (the original bug).
      expect(published.length).toBeLessThanOrEqual(1);
      for (const value of published) {
        const rejected = KNOWN_PLACEHOLDER_SECRETS.includes(value) || isLowEntropySecret(value);
        expect({ key, rejected }).toEqual({ key, rejected: true });
      }
    }
  });
});
