import { validateEnv, validateWalletEncryptionKey } from './env.validation';

// ---------------------------------------------------------------------------
// Minimal valid config — every required field present, no optional fields.
// Tests that need to break one field clone this and override the target key.
// ---------------------------------------------------------------------------
const VALID_KEY_64 =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a12b';

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
  JWT_SECRET: 'Kx7Qm2Vp9Lr4Tn8Ws3Zb6Yc1Hj5Fd0Ag',
  JWT_EXPIRY: '3600',
  // Refresh token
  REFRESH_TOKEN_SECRET: 'Ae3Nh8Uq2Wz5Rp9Bv4Cm7Kx1Tj6Ys0Dg',
  REFRESH_TOKEN_EXPIRY: '604800',
  // OTP
  OTP_SECRET: 'Zm4Pl9Kc1Vx7Rq2Nb8Ht5Wy3As6Df0Gj',
  // Payment provider
  PROVIDER_WEBHOOK_SECRET: 'Qn6Bv3Xm8Ls1Pw5Kt9Rd2Cf7Hy4Za0Ue',
  OTP_EXPIRY: '300',
  // Wallet Encryption Key
  WALLET_ENCRYPTION_KEY: VALID_KEY_64,
  // Mail
  MAIL_HOST: 'smtp.example.com',
  MAIL_PORT: '587',
  MAIL_USER: 'sender@example.com',
  MAIL_PASSWORD: 'mailpass',
  MAIL_FROM: 'noreply@example.com',
  MAIL_SECURE: 'false',
  // Observability
  SLOW_QUERY_THRESHOLD_MS: '1000',
  // Stellar Hot Wallet
  STELLAR_HOT_WALLET_SECRET: 'S1234567890',
  ALLOWED_ORIGINS: 'https://app.example.com',
};

/** Return a copy of VALID_ENV with the given overrides applied. */
function env(
  overrides: Record<string, string | undefined> = {},
): Record<string, unknown> {
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
      expect(result.PORT).toBe(3000); // transformed to number
      expect(result.JWT_SECRET).toBe('Kx7Qm2Vp9Lr4Tn8Ws3Zb6Yc1Hj5Fd0Ag');
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

  // ── PROVIDER_WEBHOOK_SECRET ───────────────────────────────────────────────

  describe('PROVIDER_WEBHOOK_SECRET', () => {
    it('fails startup validation when PROVIDER_WEBHOOK_SECRET is missing', () => {
      expect(() =>
        validateEnv(env({ PROVIDER_WEBHOOK_SECRET: undefined })),
      ).toThrow('PROVIDER_WEBHOOK_SECRET');
    });

    it('fails when PROVIDER_WEBHOOK_SECRET is shorter than 32 characters', () => {
      expect(() =>
        validateEnv(env({ PROVIDER_WEBHOOK_SECRET: 'secret' })),
      ).toThrow(
        'PROVIDER_WEBHOOK_SECRET must be at least 32 characters for security',
      );
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
      expect(() => validateEnv(env({ JWT_SECRET: 'tooshort' }))).toThrow(
        'JWT_SECRET must be at least 32 characters for security',
      );
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
      expect(() => validateEnv(env({ MAIL_USER: 'not-an-email' }))).toThrow(
        'MAIL_USER must be a valid email',
      );
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
      expect(() => validateEnv(env({ MAIL_FROM: 'bad-value' }))).toThrow(
        'MAIL_FROM must be a valid email',
      );
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
      expect(() => validateEnv(env({ REFRESH_TOKEN_SECRET: 'short' }))).toThrow(
        'REFRESH_TOKEN_SECRET must be at least 32 characters for security',
      );
    });
  });

  describe('OTP_SECRET', () => {
    it('fails when shorter than 32 characters', () => {
      expect(() => validateEnv(env({ OTP_SECRET: 'short' }))).toThrow(
        'OTP_SECRET must be at least 32 characters for security',
      );
    });
  });

  // ── WALLET_ENCRYPTION_KEY (required 64-char hex string) ────────────────

  describe('WALLET_ENCRYPTION_KEY', () => {
    it('fails when WALLET_ENCRYPTION_KEY is missing', () => {
      expect(() =>
        validateEnv(env({ WALLET_ENCRYPTION_KEY: undefined })),
      ).toThrow('Environment validation failed');
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
      ).toThrow('WALLET_ENCRYPTION_KEY must be exactly 64 hex characters');
    });

    it('fails when key is 65 characters (too long)', () => {
      expect(() =>
        validateEnv(env({ WALLET_ENCRYPTION_KEY: 'a'.repeat(65) })),
      ).toThrow('WALLET_ENCRYPTION_KEY must be exactly 64 hex characters');
    });

    it('fails when key contains non-hex characters', () => {
      const invalidKey = 'z'.repeat(64); // 'z' is not a hex char
      expect(() =>
        validateEnv(env({ WALLET_ENCRYPTION_KEY: invalidKey })),
      ).toThrow('Environment validation failed');
    });

    it('fails when key is an empty string', () => {
      expect(() => validateEnv(env({ WALLET_ENCRYPTION_KEY: '' }))).toThrow(
        'WALLET_ENCRYPTION_KEY must be exactly 64 hex characters',
      );
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
    expect(validateWalletEncryptionKey('aAbBcCdDeEfF1234'.repeat(4))).toBe(
      true,
    );
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

describe('validateEnv secret hygiene (issue #1543)', () => {
  const RANDOM = {
    JWT_SECRET: 'q8Zr3vKx1LmN7pTd5WcY2bHj9sFg4uAe',
    REFRESH_TOKEN_SECRET: 'Hn6Vb2Xc8Zq4Mw1Ke7Rt3Yu9Pi5Lo0As',
    OTP_SECRET: 'Tg4Jk8Df2Sa6Qw1Er7Ty3Ui9Op5Zx0Cv',
    PROVIDER_WEBHOOK_SECRET: 'Bn5Mk9Lj3Hg7Fd1Sa4Pq8Wo2Ei6Ru0Yt',
    WALLET_ENCRYPTION_KEY:
      '9f3b7c1d5e8a2406b1d7c93e4f5a608c2d1e7b9a3c5f4e6d8b0a1c2d3e4f5a6b',
  };
  const PROD = { ...VALID_ENV, ...RANDOM, NODE_ENV: 'production' };

  it('accepts valid random secrets in production', () => {
    expect(() => validateEnv(PROD)).not.toThrow();
  });

  it('rejects a .env.example placeholder in production', () => {
    expect(() =>
      validateEnv({ ...PROD, JWT_SECRET: 'change-me-to-a-long-random-string' }),
    ).toThrow(/JWT_SECRET: is a placeholder/);
  });

  it('rejects the sequential example wallet key in production', () => {
    expect(() =>
      validateEnv({
        ...PROD,
        WALLET_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
      }),
    ).toThrow(/WALLET_ENCRYPTION_KEY/);
  });

  it('rejects the same value for two secrets in every environment', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, OTP_SECRET: VALID_ENV.JWT_SECRET }),
    ).toThrow(/OTP_SECRET: must differ from JWT_SECRET/);
  });

  it('only warns about placeholders outside production', () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    expect(() =>
      validateEnv({
        ...VALID_ENV,
        JWT_SECRET: 'change-me-to-a-long-random-string',
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'));
    warn.mockRestore();
  });
});

describe('validateEnv AML screening configuration (issue #1594)', () => {
  it('defaults the watchlist path and similarity threshold', () => {
    const result = validateEnv(env());
    expect(result.AML_WATCHLIST_PATH).toBe('');
    expect(result.AML_SCREENING_SIMILARITY_THRESHOLD).toBe(0.92);
  });

  it('accepts a custom watchlist path and threshold', () => {
    const result = validateEnv(
      env({
        AML_WATCHLIST_PATH: '/etc/aml/watchlist.json',
        AML_SCREENING_SIMILARITY_THRESHOLD: '0.95',
      }),
    );
    expect(result.AML_WATCHLIST_PATH).toBe('/etc/aml/watchlist.json');
    expect(result.AML_SCREENING_SIMILARITY_THRESHOLD).toBe(0.95);
  });

  it('rejects a threshold outside the 0.5 to 1 range', () => {
    expect(() =>
      validateEnv(env({ AML_SCREENING_SIMILARITY_THRESHOLD: '1.5' })),
    ).toThrow(/AML_SCREENING_SIMILARITY_THRESHOLD/);
  });
});

describe('validateEnv production network safety (issues #1540, #1541)', () => {
  const PROD = { ...VALID_ENV, NODE_ENV: 'production' };

  it('fails fast in production when ALLOWED_ORIGINS is empty', () => {
    expect(() => validateEnv({ ...PROD, ALLOWED_ORIGINS: '' })).toThrow(
      /ALLOWED_ORIGINS/,
    );
  });

  it('accepts production with an explicit origin list', () => {
    expect(() =>
      validateEnv({ ...PROD, ALLOWED_ORIGINS: 'https://app.nexafx.io' }),
    ).not.toThrow();
  });

  it('rejects a wildcard origin in any environment', () => {
    expect(() => validateEnv({ ...VALID_ENV, ALLOWED_ORIGINS: '*' })).toThrow();
  });

  it('allows an empty ALLOWED_ORIGINS outside production', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, ALLOWED_ORIGINS: '' }),
    ).not.toThrow();
  });

  it('refuses DB_SSL_REJECT_UNAUTHORIZED=false in production', () => {
    expect(() =>
      validateEnv({
        ...PROD,
        ALLOWED_ORIGINS: 'https://app.nexafx.io',
        DB_SSL: 'true',
        DB_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).toThrow(/DB_SSL_REJECT_UNAUTHORIZED/);
  });

  it('allows DB_SSL_REJECT_UNAUTHORIZED=false outside production', () => {
    expect(() =>
      validateEnv({
        ...VALID_ENV,
        DB_SSL: 'true',
        DB_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).not.toThrow();
  });
});
