import { AllowedOriginsError, buildCorsOptions, parseAllowedOrigins } from './cors';

describe('parseAllowedOrigins', () => {
  it('returns [] for empty input', () => {
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it('trims spaces and ignores trailing commas', () => {
    expect(parseAllowedOrigins(' https://a.com , https://b.com ,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('normalises to the origin and de-duplicates', () => {
    expect(parseAllowedOrigins('https://a.com/path, https://a.com/')).toEqual(['https://a.com']);
  });

  it('rejects a wildcard', () => {
    expect(() => parseAllowedOrigins('*')).toThrow(AllowedOriginsError);
    expect(() => parseAllowedOrigins('https://a.com,*')).toThrow(AllowedOriginsError);
  });

  it('rejects invalid URLs and non-http protocols', () => {
    expect(() => parseAllowedOrigins('not a url')).toThrow(AllowedOriginsError);
    expect(() => parseAllowedOrigins('ftp://a.com')).toThrow(AllowedOriginsError);
  });
});

describe('buildCorsOptions', () => {
  const decide = (opts: ReturnType<typeof buildCorsOptions>, origin?: string) => {
    if (typeof opts.origin === 'boolean') return opts.origin;
    let result: boolean | undefined;
    opts.origin(origin, (_err, allow) => {
      result = allow;
    });
    return result;
  };

  it('denies everything in production when no origins are configured', () => {
    const opts = buildCorsOptions([], 'production');
    expect(opts.origin).toBe(false);
  });

  it('allows only configured origins', () => {
    const opts = buildCorsOptions(['https://app.nexafx.io'], 'production');
    expect(decide(opts, 'https://app.nexafx.io')).toBe(true);
    expect(decide(opts, 'https://evil.example')).toBe(false);
  });

  it('allows requests with no Origin header', () => {
    expect(decide(buildCorsOptions(['https://a.com'], 'production'), undefined)).toBe(true);
  });

  it('allows only localhost when nothing is configured outside production', () => {
    const opts = buildCorsOptions([], 'development');
    expect(decide(opts, 'http://localhost:3001')).toBe(true);
    expect(decide(opts, 'https://evil.example')).toBe(false);
  });

  it('caps the preflight max age', () => {
    expect(buildCorsOptions([], 'development').maxAge).toBeLessThanOrEqual(3600);
  });
});
