import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isCommonPassword } from './common-passwords';

/** Default requirements; also defines the shape of a policy override. */
export const DEFAULT_PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  /** bcrypt silently ignores everything after the first 72 bytes. */
  maxBytes: 72,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventCommonPasswords: true,
};

export type PasswordPolicy = typeof DEFAULT_PASSWORD_POLICY;

const uncommon = (pw: string): boolean => !isCommonPassword(pw);

/** Pairs each policy flag with the check it enforces and how to describe it. */
const RULES: [keyof PasswordPolicy, (pw: string) => boolean, string][] = [
  ['requireUppercase', (pw) => /[A-Z]/.test(pw), 'an uppercase letter'],
  ['requireLowercase', (pw) => /[a-z]/.test(pw), 'a lowercase letter'],
  ['requireNumbers', (pw) => /[0-9]/.test(pw), 'a number'],
  ['requireSpecialChars', (pw) => /[^A-Za-z0-9]/.test(pw), 'a symbol'],
  ['preventCommonPasswords', uncommon, 'a less predictable phrase'],
];

/** Validates passwords against a config-driven policy, defaulting when unset. */
@Injectable()
export class PasswordPolicyService {
  constructor(private readonly config: ConfigService) {}

  public getPolicy(): PasswordPolicy {
    const set = this.config.get<Partial<PasswordPolicy>>('passwordPolicy');
    return { ...DEFAULT_PASSWORD_POLICY, ...set };
  }

  /**
   * Returns every unmet requirement; an empty array means the password passes.
   * `context` lets the policy reject passwords built from the user's own
   * email local-part or name.
   */
  public check(password: string, context: PasswordContext = {}): string[] {
    const { minLength: lo, maxLength: hi, maxBytes, ...policy } = this.getPolicy();
    const errors: string[] = [];
    if (password.length < lo || password.length > hi) {
      errors.push(`Password must be ${lo}-${hi} characters.`);
    }
    // bcrypt only reads 72 bytes, so a longer password would be silently truncated.
    if (Buffer.byteLength(password, 'utf8') > maxBytes) {
      errors.push(`Password must be at most ${maxBytes} bytes (non-ASCII characters use more than one).`);
    }
    for (const [flag, satisfied, description] of RULES) {
      if (policy[flag as keyof typeof policy] && !satisfied(password)) {
        errors.push(`Password must include ${description}.`);
      }
    }
    const personal = personalTokens(context).find((token) => password.toLowerCase().includes(token));
    if (personal) {
      errors.push('Password must not contain your email name or your first or last name.');
    }
    return errors;
  }

  /** Throws {@link BadRequestException} when the password violates the policy. */
  public validate(password: string, context: PasswordContext = {}): void {
    const errors = this.check(password, context);
    if (errors.length > 0) throw new BadRequestException(errors);
  }
}

export interface PasswordContext {
  email?: string;
  firstName?: string;
  lastName?: string;
}

/** Lower-cased identity fragments (3+ characters) a password may not contain. */
function personalTokens(context: PasswordContext): string[] {
  const local = context.email?.split('@')[0] ?? '';
  return [local, context.firstName, context.lastName]
    .map((value) => (value ?? '').trim().toLowerCase())
    .filter((value) => value.length >= 3);
}
