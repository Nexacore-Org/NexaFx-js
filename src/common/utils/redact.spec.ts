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
