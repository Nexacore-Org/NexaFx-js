import { validateEnv, validateWalletEncryptionKey } from './env.validation';

// ---------------------------------------------------------------------------
// Minimal valid config — every required field present, no optional fields.
// Tests that need to break one field clone this and override the target key.
// ---------------------------------------------------------------------------
const VALID_KEY_64 = 'a'.repeat(64); // valid 64-char hex string

const VALID_ENV: Record<string, string> = {
  // App
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'info',
  SWAGGER_ENABLED: 'false',
  BODY_LIMIT_JSON: '10',
  BODY_LIMIT_URLENCODED: '10',
  // DB
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'postgres',
  DB_PASSWORD: 'secret',
  DB_NAME: 'nexafx',
  DB_SSL: 'false',
  // JWT
  JWT_SECRET: 'a'.repeat(32),
  JWT_EXPIRY: '3600',
  // Refresh token
  REFRESH_TOKEN_SECRET: 'b'.repeat(32),
  REFRESH_TOKEN_EXPIRY: '604800',
  // OTP
  OTP_SECRET: 'c'.repeat(32),
  OTP_EXPIRY: '300',
  // Mail
  MAIL_HOST: 'smtp.example.com',
  MAIL_PORT: '587',
  MAIL_USER: 'sender@example.com',
  MAIL_PASSWORD: 'mailpass',
  MAIL_FROM: 'noreply@example.com',
  MAIL_SECURE: 'false',
  // Observability
  SLOW_QUERY_THRESHOLD_MS: '1000',
};

/** Return a copy of VALID_ENV with the given overrides applied. */
function env(overrides: Record<string, string | undefined> = {}): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...VALID_ENV };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateEnv', () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  describe('valid configuration', () => {
    it('accepts a fully valid config and returns a typed object', () => {
      const result = validateEnv(env());
      expect(result).toBeDefined();
      expect(result.NODE_ENV).toBe('test');
      expect(result.PORT).toBe(3000);          // transformed to number
      expect(result.JWT_SECRET).toBe('a'.repeat(32));
    });

    it('coerces PORT string to a number', () => {
      const result = validateEnv(env({ PORT: '8080' }));
      expect(result.PORT).toBe(8080);
      expect(typeof result.PORT).toBe('number');
    });

    it('coerces SWAGGER_ENABLED "true" string to boolean true', () => {
      const result = validateEnv(env({ SWAGGER_ENABLED: 'true' }));
      expect(result.SWAGGER_ENABLED).toBe(true);
    });

    it('coerces DB_SSL "false" string to boolean false', () => {
      const result = validateEnv(env({ DB_SSL: 'false' }));
      expect(result.DB_SSL).toBe(false);
    });
  });

  // ── Default values ────────────────────────────────────────────────────────

  describe('default values', () => {
    it('applies NODE_ENV default of "development" when absent', () => {
      const result = validateEnv(env({ NODE_ENV: undefined }));
      expect(result.NODE_ENV).toBe('development');
    });

    it('applies PORT default of 3000 when absent', () => {
      const result = validateEnv(env({ PORT: undefined }));
      expect(result.PORT).toBe(3000);
    });

    it('applies LOG_LEVEL default of "info" when absent', () => {
      const result = validateEnv(env({ LOG_LEVEL: undefined }));
      expect(result.LOG_LEVEL).toBe('info');
    });

    it('applies REDIS_HOST default of "localhost" when absent', () => {
      const result = validateEnv(env({ REDIS_HOST: undefined }));
      expect(result.REDIS_HOST).toBe('localhost');
    });

    it('applies REDIS_PORT default of 6379 when absent', () => {
      const result = validateEnv(env({ REDIS_PORT: undefined }));
      expect(result.REDIS_PORT).toBe(6379);
    });

    it('applies JWT_EXPIRY default of 3600 when absent', () => {
      const result = validateEnv(env({ JWT_EXPIRY: undefined }));
      expect(result.JWT_EXPIRY).toBe(3600);
    });

    it('applies REFRESH_TOKEN_EXPIRY default of 604800 when absent', () => {
      const result = validateEnv(env({ REFRESH_TOKEN_EXPIRY: undefined }));
      expect(result.REFRESH_TOKEN_EXPIRY).toBe(604800);
    });

    it('applies IDEMPOTENCY_TTL_HOURS default of 24 when absent', () => {
      const result = validateEnv(env({ IDEMPOTENCY_TTL_HOURS: undefined }));
      expect(result.IDEMPOTENCY_TTL_HOURS).toBe(24);
    });

    it('applies RATE_LIMIT_MAX_REQUESTS default of 100 when absent', () => {
      const result = validateEnv(env({ RATE_LIMIT_MAX_REQUESTS: undefined }));
      expect(result.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    });
  });

  // ── JWT_SECRET ────────────────────────────────────────────────────────────

  describe('JWT_SECRET', () => {
    it('fails with a clear error when JWT_SECRET is missing', () => {
      expect(() => validateEnv(env({ JWT_SECRET: undefined }))).toThrow(
        'Environment validation failed',
      );
      expect(() => validateEnv(env({ JWT_SECRET: undefined }))).toThrow(
        'JWT_SECRET',
      );
    });

    it('fails when JWT_SECRET is shorter than 32 characters', () => {
      expect(() =>
        validateEnv(env({ JWT_SECRET: 'tooshort' })),
      ).toThrow('JWT_SECRET must be at least 32 characters for security');
    });

    it('accepts JWT_SECRET of exactly 32 characters', () => {
      const result = validateEnv(env({ JWT_SECRET: 'x'.repeat(32) }));
      expect(result.JWT_SECRET).toBe('x'.repeat(32));
    });

    it('accepts JWT_SECRET longer than 32 characters', () => {
      const result = validateEnv(env({ JWT_SECRET: 'x'.repeat(64) }));
      expect(result.JWT_SECRET).toHaveLength(64);
    });
  });

  // ── MAIL_USER ─────────────────────────────────────────────────────────────

  describe('MAIL_USER', () => {
    it('fails with a clear error when MAIL_USER is not a valid email', () => {
      expect(() =>
        validateEnv(env({ MAIL_USER: 'not-an-email' })),
      ).toThrow('MAIL_USER must be a valid email');
    });

    it('fails when MAIL_USER is an empty string', () => {
      expect(() => validateEnv(env({ MAIL_USER: '' }))).toThrow(
        'Environment validation failed',
      );
    });

    it('accepts a valid MAIL_USER email address', () => {
      const result = validateEnv(env({ MAIL_USER: 'admin@nexafx.io' }));
      expect(result.MAIL_USER).toBe('admin@nexafx.io');
    });
  });

  // ── MAIL_FROM ─────────────────────────────────────────────────────────────

  describe('MAIL_FROM', () => {
    it('fails when MAIL_FROM is not a valid email', () => {
      expect(() =>
        validateEnv(env({ MAIL_FROM: 'bad-value' })),
      ).toThrow('MAIL_FROM must be a valid email');
    });
  });

  // ── Required DB fields ────────────────────────────────────────────────────

  describe('required database fields', () => {
    it.each(['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'])(
      'fails when %s is missing',
      (field) => {
        expect(() => validateEnv(env({ [field]: undefined }))).toThrow(
          'Environment validation failed',
        );
      },
    );

    it('fails when DB_PORT is out of range (0)', () => {
      expect(() => validateEnv(env({ DB_PORT: '0' }))).toThrow(
        'Environment validation failed',
      );
    });

    it('fails when DB_PORT is out of range (65536)', () => {
      expect(() => validateEnv(env({ DB_PORT: '65536' }))).toThrow(
        'Environment validation failed',
      );
    });
  });

  // ── REFRESH_TOKEN_SECRET / OTP_SECRET ─────────────────────────────────────

  describe('REFRESH_TOKEN_SECRET', () => {
    it('fails when shorter than 32 characters', () => {
      expect(() =>
        validateEnv(env({ REFRESH_TOKEN_SECRET: 'short' })),
      ).toThrow(
        'REFRESH_TOKEN_SECRET must be at least 32 characters for security',
      );
    });
  });

  describe('OTP_SECRET', () => {
    it('fails when shorter than 32 characters', () => {
      expect(() =>
        validateEnv(env({ OTP_SECRET: 'short' })),
      ).toThrow('OTP_SECRET must be at least 32 characters for security');
    });
  });

  // ── WALLET_ENCRYPTION_KEY (optional with refine) ──────────────────────────

  describe('WALLET_ENCRYPTION_KEY', () => {
    it('passes when absent (field is optional)', () => {
      const result = validateEnv(env({ WALLET_ENCRYPTION_KEY: undefined }));
      expect(result.WALLET_ENCRYPTION_KEY).toBeUndefined();
    });

    it('accepts a valid 64-character lowercase hex string', () => {
      const result = validateEnv(env({ WALLET_ENCRYPTION_KEY: VALID_KEY_64 }));
      expect(result.WALLET_ENCRYPTION_KEY).toBe(VALID_KEY_64);
    });

    it('accepts a valid 64-character uppercase hex string', () => {
      const upperHex = 'A'.repeat(64);
      const result = validateEnv(env({ WALLET_ENCRYPTION_KEY: upperHex }));
      expect(result.WALLET_ENCRYPTION_KEY).toBe(upperHex);
    });

    it('fails when key is 63 characters (too short)', () => {
      expect(() =>
        validateEnv(env({ WALLET_ENCRYPTION_KEY: 'a'.repeat(63) })),
      ).toThrow('WALLET_ENCRYPTION_KEY must be a 64-character hex string');
    });

    it('fails when key is 65 characters (too long)', () => {
      expect(() =>
        validateEnv(env({ WALLET_ENCRYPTION_KEY: 'a'.repeat(65) })),
      ).toThrow('WALLET_ENCRYPTION_KEY must be a 64-character hex string');
    });

    it('fails when key contains non-hex characters', () => {
      const invalidKey = 'z'.repeat(64); // 'z' is not a hex char
      expect(() =>
        validateEnv(env({ WALLET_ENCRYPTION_KEY: invalidKey })),
      ).toThrow('WALLET_ENCRYPTION_KEY must be a 64-character hex string');
    });

    it('fails when key is an empty string', () => {
      expect(() =>
        validateEnv(env({ WALLET_ENCRYPTION_KEY: '' })),
      ).toThrow('WALLET_ENCRYPTION_KEY must be a 64-character hex string');
    });
  });

  // ── Error message quality ─────────────────────────────────────────────────

  describe('error message quality', () => {
    it('includes the field path in the error message', () => {
      let message = '';
      try {
        validateEnv(env({ JWT_SECRET: undefined }));
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain('JWT_SECRET');
    });

    it('reports all failing fields in a single error (not just the first)', () => {
      let message = '';
      try {
        validateEnv(
          env({
            JWT_SECRET: undefined,
            MAIL_USER: 'bad',
            DB_HOST: undefined,
          }),
        );
      } catch (e) {
        message = (e as Error).message;
      }
      // All three broken fields should appear in the same error
      expect(message).toContain('JWT_SECRET');
      expect(message).toContain('MAIL_USER');
      expect(message).toContain('DB_HOST');
    });
  });
});

// ---------------------------------------------------------------------------
// validateWalletEncryptionKey (standalone helper)
// ---------------------------------------------------------------------------

describe('validateWalletEncryptionKey', () => {
  it('returns true for a valid 64-char lowercase hex string', () => {
    expect(validateWalletEncryptionKey('a'.repeat(64))).toBe(true);
  });

  it('returns true for a valid 64-char uppercase hex string', () => {
    expect(validateWalletEncryptionKey('F'.repeat(64))).toBe(true);
  });

  it('returns true for a mixed-case 64-char hex string', () => {
    expect(validateWalletEncryptionKey('aAbBcCdDeEfF'.repeat(64 / 12))).toBe(true);
  });

  it('returns false for a 63-char hex string', () => {
    expect(validateWalletEncryptionKey('a'.repeat(63))).toBe(false);
  });

  it('returns false for a 65-char hex string', () => {
    expect(validateWalletEncryptionKey('a'.repeat(65))).toBe(false);
  });

  it('returns false for a 64-char string with non-hex characters', () => {
    expect(validateWalletEncryptionKey('z'.repeat(64))).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(validateWalletEncryptionKey('')).toBe(false);
  });

  it('returns false for a string with spaces', () => {
    expect(validateWalletEncryptionKey(' '.repeat(64))).toBe(false);
  });
});
