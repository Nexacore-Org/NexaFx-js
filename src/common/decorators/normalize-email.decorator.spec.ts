import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../../auth/dto/login.dto';
import { RegisterDto } from '../../auth/dto/register.dto';
import { ForgotPasswordDto } from '../../auth/dto/forgot-password.dto';
import { normalizeEmail } from './normalize-email.decorator';

describe('email normalisation', () => {
  it('trims and lower-cases strings and leaves other values alone', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(42)).toBe(42);
  });

  it.each([
    ['LoginDto', LoginDto, { email: ' Alice@X.com ', password: 'password1' }],
    ['RegisterDto', RegisterDto, { email: 'ALICE@x.com', password: 'password1', firstName: 'A', lastName: 'B' }],
    ['ForgotPasswordDto', ForgotPasswordDto, { email: ' Alice@X.COM' }],
  ])('%s normalises the email before validation', async (_name, cls, body) => {
    const dto = plainToInstance(cls as any, body) as { email: string };
    expect(dto.email).toBe('alice@x.com');
    await expect(validate(dto as object)).resolves.toHaveLength(0);
  });
});
