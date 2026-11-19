import { buildPostgresConnectionOptions } from './database-options';

describe('buildPostgresConnectionOptions (issue #1541)', () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.DB_SSL;
    delete process.env.DB_SSL_CA;
    delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
  });

  afterAll(() => {
    process.env = original;
  });

  it('disables SSL when DB_SSL is not true', () => {
    expect(buildPostgresConnectionOptions().ssl).toBe(false);
  });

  it('verifies the server certificate by default when SSL is on', () => {
    process.env.DB_SSL = 'true';
    expect(buildPostgresConnectionOptions().ssl).toEqual({ rejectUnauthorized: true });
  });

  it('passes an inline PEM CA through', () => {
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_CA = '-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----';

    const ssl = buildPostgresConnectionOptions().ssl as { rejectUnauthorized: boolean; ca?: string };

    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe('-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----');
  });

  it('allows verification to be disabled explicitly', () => {
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
    expect(buildPostgresConnectionOptions().ssl).toEqual({ rejectUnauthorized: false });
  });

  it('ignores CA settings when SSL is off', () => {
    process.env.DB_SSL_CA = '-----BEGIN CERTIFICATE-----x-----END CERTIFICATE-----';
    expect(buildPostgresConnectionOptions().ssl).toBe(false);
  });
});
