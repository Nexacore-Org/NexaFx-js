import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { LogoutDto, RefreshTokenDto } from './refresh-token.dto';
import { RegisterDto } from './register.dto';
import { ResetPasswordDto } from './reset-password.dto';

const check = (cls: new () => object, body: unknown) =>
  validate(plainToInstance(cls, body) as object, { whitelist: true, forbidNonWhitelisted: true });

describe('auth DTO validation (issue #1528)', () => {
  describe('RefreshTokenDto / LogoutDto', () => {
    it.each([
      [{ refreshToken: { a: 1 } }],
      [{ refreshToken: ['x'] }],
      [{ refreshToken: 12345 }],
      [{ refreshToken: 'short' }],
      [{ refreshToken: 'x'.repeat(513) }],
      [{}],
    ])('refresh rejects %j with a validation error, not a 500', async (body) => {
      expect((await check(RefreshTokenDto, body)).length).toBeGreaterThan(0);
    });

    it('refresh accepts a UUID-length token; logout allows it to be absent', async () => {
      expect(await check(RefreshTokenDto, { refreshToken: '3b241101-e2bb-4255-8caf-4136c566a962' })).toHaveLength(0);
      expect(await check(LogoutDto, {})).toHaveLength(0);
      expect((await check(LogoutDto, { refreshToken: { a: 1 } })).length).toBeGreaterThan(0);
    });
  });

  describe('LoginDto', () => {
    it('accepts a legacy 6-character password so it gets a 401, not a 400', async () => {
      expect(await check(LoginDto, { email: 'a@b.co', password: 'abc123' })).toHaveLength(0);
    });

    it('rejects empty, oversized and non-string passwords and oversized emails', async () => {
      expect((await check(LoginDto, { email: 'a@b.co', password: '' })).length).toBeGreaterThan(0);
      expect((await check(LoginDto, { email: 'a@b.co', password: 'x'.repeat(129) })).length).toBeGreaterThan(0);
      expect((await check(LoginDto, { email: `${'a'.repeat(250)}@b.co`, password: 'x' })).length).toBeGreaterThan(0);
    });

    it('no longer accepts the unenforced totpCode field', async () => {
      expect((await check(LoginDto, { email: 'a@b.co', password: 'x', totpCode: '123456' })).length).toBeGreaterThan(0);
    });
  });

  describe('RegisterDto', () => {
    const ok = { email: 'a@b.co', password: 'Str0ng!Passw0rd', firstName: 'Ada', lastName: 'Lovelace' };

    it('accepts a normal body', async () => {
      expect(await check(RegisterDto, ok)).toHaveLength(0);
    });

    it.each([
      ['oversized password', { ...ok, password: 'x'.repeat(129) }],
      ['empty first name', { ...ok, firstName: '' }],
      ['10 MB first name', { ...ok, firstName: 'x'.repeat(10 * 1024 * 1024) }],
      ['oversized last name', { ...ok, lastName: 'x'.repeat(101) }],
    ])('rejects %s', async (_label, body) => {
      expect((await check(RegisterDto, body)).length).toBeGreaterThan(0);
    });
  });

  it('ResetPasswordDto bounds the password at 128 and leaves strength to the policy', async () => {
    const token = 'x'.repeat(32);
    expect(await check(ResetPasswordDto, { token, newPassword: 'a-12-char-pass!' })).toHaveLength(0);
    expect((await check(ResetPasswordDto, { token, newPassword: 'x'.repeat(129) })).length).toBeGreaterThan(0);
  });
});
