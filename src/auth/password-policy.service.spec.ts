import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';
import { isCommonPassword } from './common-passwords';

const service = new PasswordPolicyService({ get: jest.fn() } as any);
const GOOD = 'Tr1cky-Horse-Battery-9!';

describe('PasswordPolicyService (#1369)', () => {
  it('accepts a strong, unrelated password', () => {
    expect(service.check(GOOD)).toEqual([]);
  });

  it('exposes the 72-byte bcrypt cap in the policy', () => {
    expect(service.getPolicy().maxBytes).toBe(72);
  });

  it('measures length in UTF-8 bytes: 40 emoji is 160 bytes and is rejected', () => {
    const emoji = 'Aa1!' + '😀'.repeat(40);
    expect(emoji.length).toBeLessThanOrEqual(128);
    expect(service.check(emoji).some((e) => e.includes('72 bytes'))).toBe(true);
  });

  it('rejects a long ASCII passphrase over 72 bytes even though it is under 128 characters', () => {
    const long = 'Aa1!' + 'x'.repeat(80);
    expect(service.check(long).some((e) => e.includes('72 bytes'))).toBe(true);
  });

  it('accepts exactly 72 bytes', () => {
    const exact = 'Aa1!' + 'k7Qz'.repeat(17);
    expect(Buffer.byteLength(exact)).toBe(72);
    expect(service.check(exact)).toEqual([]);
  });

  it.each(['Password123!x', 'P@ssw0rd2026!!', 'Qwerty123456!A', 'Welcome2024!!ab', 'Letmein-2024-Ok!'])(
    'rejects the common password %s',
    (pw) => {
      expect(service.check(pw).some((e) => e.includes('less predictable'))).toBe(true);
    },
  );

  it('rejects a password containing the email local-part or the user\'s names', () => {
    const ctx = { email: 'ada.lovelace@example.com', firstName: 'Ada', lastName: 'Lovelace' };
    expect(service.check('Zx9!ada.lovelace-Quartz', ctx)).not.toEqual([]);
    expect(service.check('Zx9!LOVELACE-Quartz-77', ctx)).not.toEqual([]);
    expect(service.check(GOOD, ctx)).toEqual([]);
  });

  it('ignores very short name fragments', () => {
    expect(service.check(GOOD, { firstName: 'Al', email: 'al@example.com' })).toEqual([]);
  });

  it('validate() throws BadRequestException with every error', () => {
    try {
      service.validate('short');
      fail('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({ message: expect.any(Array) });
    }
  });

  it('keeps the other rules (case, number, symbol)', () => {
    const messages = service.check('alllowercaseletters').join(' ');
    expect(messages).toContain('uppercase');
    expect(messages).toContain('number');
    expect(messages).toContain('symbol');
  });
});

describe('isCommonPassword', () => {
  it('normalises case, trailing digits/symbols and leetspeak', () => {
    expect(isCommonPassword('PASSWORD')).toBe(true);
    expect(isCommonPassword('Password99!!')).toBe(true);
    expect(isCommonPassword('Pa55w0rd')).toBe(true);
  });

  it('flags repeated units', () => {
    expect(isCommonPassword('abababababab')).toBe(true);
    expect(isCommonPassword('aaaaaaaaaaaa')).toBe(true);
  });

  it('lets unrelated passphrases through', () => {
    expect(isCommonPassword('violet-anchor-ferry-29')).toBe(false);
  });
});
