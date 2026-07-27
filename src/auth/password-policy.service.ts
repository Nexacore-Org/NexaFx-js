import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Default requirements; also defines the shape of a policy override. */
export const DEFAULT_PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventCommonPasswords: true,
};

export type PasswordPolicy = typeof DEFAULT_PASSWORD_POLICY;

const COMMON = new Set(
  'password password1 123456 12345678 qwerty abc123 letmein admin'.split(' '),
);

const uncommon = (pw: string): boolean => !COMMON.has(pw.toLowerCase());

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

  /** Returns every unmet requirement; an empty array means the password passes. */
  public check(password: string): string[] {
    const { minLength: lo, maxLength: hi, ...policy } = this.getPolicy();
    const errors: string[] = [];
    if (password.length < lo || password.length > hi) {
      errors.push(`Password must be ${lo}-${hi} characters.`);
    }
    for (const [flag, satisfied, description] of RULES) {
      if (policy[flag as keyof typeof policy] && !satisfied(password)) {
        errors.push(`Password must include ${description}.`);
      }
    }
    return errors;
  }

  /** Throws {@link BadRequestException} when the password violates the policy. */
  public validate(password: string): void {
    const errors = this.check(password);
    if (errors.length > 0) throw new BadRequestException(errors);
  }
}
