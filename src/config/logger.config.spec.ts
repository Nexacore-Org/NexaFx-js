import {
  buildPinoHttpOptions,
  maskSensitiveQuery,
  REDACT_PATHS,
  serializeRequest,
} from './logger.config';

describe('logger config (issue #1547)', () => {
  it('redacts the credential-bearing headers', () => {
    const options = buildPinoHttpOptions({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);

    expect(options.redact.paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
      ]),
    );
    expect(options.redact.censor).toBe('[REDACTED]');
    expect(REDACT_PATHS.length).toBeGreaterThanOrEqual(4);
  });

  it('serializes a request without credentials or arbitrary headers', () => {
    const serialized = serializeRequest({
      id: 'r1',
      method: 'GET',
      url: '/api/v1/admin/exports/42/download?token=abc.def.ghi&format=csv',
      headers: {
        authorization: 'Bearer SECRET-JWT',
        cookie: 'sid=SECRET-COOKIE',
        'x-api-key': 'SECRET-KEY',
        'user-agent': 'jest',
        'x-correlation-id': 'corr-1234',
      },
    });

    const text = JSON.stringify(serialized);
    expect(text).not.toContain('SECRET-JWT');
    expect(text).not.toContain('SECRET-COOKIE');
    expect(text).not.toContain('SECRET-KEY');
    expect(text).not.toContain('abc.def.ghi');
    expect(serialized.url).toBe('/api/v1/admin/exports/42/download?token=[REDACTED]&format=csv');
    expect(serialized.headers).toEqual({ 'user-agent': 'jest', 'x-correlation-id': 'corr-1234' });
  });

  describe('maskSensitiveQuery', () => {
    it('leaves URLs without a query untouched', () => {
      expect(maskSensitiveQuery('/api/v1/health')).toBe('/api/v1/health');
      expect(maskSensitiveQuery(undefined)).toBeUndefined();
    });

    it('masks token, code and signature case-insensitively and keeps others', () => {
      expect(maskSensitiveQuery('/x?Token=a&page=2&CODE=b&signature=c')).toBe(
        '/x?Token=[REDACTED]&page=2&CODE=[REDACTED]&signature=[REDACTED]',
      );
    });

    it('preserves the fragment', () => {
      expect(maskSensitiveQuery('/x?token=a#top')).toBe('/x?token=[REDACTED]#top');
    });
  });

  it('skips health and metrics probes but not other routes', () => {
    const { autoLogging } = buildPinoHttpOptions({} as NodeJS.ProcessEnv);
    expect(autoLogging.ignore({ url: '/api/v1/health' })).toBe(true);
    expect(autoLogging.ignore({ url: '/api/v1/metrics?x=1' })).toBe(true);
    expect(autoLogging.ignore({ url: '/api/v1/transactions' })).toBe(false);
  });

  it('uses pino-pretty only outside production', () => {
    expect(buildPinoHttpOptions({ NODE_ENV: 'production' } as NodeJS.ProcessEnv).transport).toBeUndefined();
    expect(buildPinoHttpOptions({ NODE_ENV: 'development' } as NodeJS.ProcessEnv).transport).toBeDefined();
  });
});
