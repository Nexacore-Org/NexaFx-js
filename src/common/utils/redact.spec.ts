import { REDACTED, isSensitiveField, maskBody } from './redact';

describe('redact', () => {
  it('redacts the real password DTO fields', () => {
    expect(isSensitiveField('newPassword')).toBe(true);
    expect(isSensitiveField('currentPassword')).toBe(true);
    expect(isSensitiveField('countryCode')).toBe(false);
  });

  it('redacts sensitive fields recursively and leaves others intact', () => {
    expect(
      maskBody({ email: 'a@b.com', newPassword: 'hunter2', nested: { currentPassword: 'x' } }),
    ).toEqual({ email: 'a@b.com', newPassword: REDACTED, nested: { currentPassword: REDACTED } });
  });
});

describe('redact: PII and URLs (issue #1532)', () => {
  const { redactUrl, isPiiField } = require('./redact');

  it('masks PII keys by default', () => {
    expect(
      maskBody({
        email: 'a@b.com',
        documentNumber: 'P1234567',
        documentUrl: 'https://s3/doc',
        iban: 'GB00',
        accountNumber: '123',
        phone: '+234',
        address: '1 Road',
        dateOfBirth: '1990-01-01',
        firstName: 'Ada',
      }),
    ).toEqual({
      email: REDACTED,
      documentNumber: REDACTED,
      documentUrl: REDACTED,
      iban: REDACTED,
      accountNumber: REDACTED,
      phone: REDACTED,
      address: REDACTED,
      dateOfBirth: REDACTED,
      firstName: 'Ada',
    });
  });

  it('lets audit snapshots keep email while still masking other PII and credentials', () => {
    expect(
      maskBody({ email: 'a@b.com', documentNumber: 'P1', password: 'x' }, 0, 10, { keepFields: ['email'] }),
    ).toEqual({ email: 'a@b.com', documentNumber: REDACTED, password: REDACTED });
  });

  it('recognises PII keys regardless of casing and separators', () => {
    expect(isPiiField('Date_Of_Birth')).toBe(true);
    expect(isPiiField('document-number')).toBe(true);
    expect(isPiiField('country')).toBe(false);
  });

  describe('redactUrl', () => {
    it('masks token-like query parameters but keeps path and other params', () => {
      expect(redactUrl('/api/v1/admin/exports/42/download?token=abc.def&format=csv')).toBe(
        '/api/v1/admin/exports/42/download?token=[REDACTED]&format=csv',
      );
      expect(redactUrl('/x?code=1&KEY=2&Signature=3&api_key=4&access_token=5&page=2')).toBe(
        '/x?code=[REDACTED]&KEY=[REDACTED]&Signature=[REDACTED]&api_key=[REDACTED]&access_token=[REDACTED]&page=2',
      );
    });

    it('handles encoded names, flags without values, fragments and no query', () => {
      expect(redactUrl('/x?t%6Fken=abc&flag#frag')).toBe('/x?t%6Fken=[REDACTED]&flag#frag');
      expect(redactUrl('/plain')).toBe('/plain');
      expect(redactUrl('')).toBe('');
      expect(redactUrl(undefined)).toBe('');
    });

    it('never leaves a token substring in the output', () => {
      expect(redactUrl('/reset?token=SECRET123')).not.toContain('SECRET123');
    });
  });
});
