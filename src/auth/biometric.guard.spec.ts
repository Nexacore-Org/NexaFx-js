import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BiometricGuard } from './biometric.guard';

const SECRET = 'biometric-secret-for-tests-0123456789';
const jwt = new JwtService({});

function build(headers: Record<string, string>, userSub = 'u1', secret: string | undefined = SECRET) {
  const request: any = { headers, user: { sub: userSub } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  const guard = new BiometricGuard(jwt, { get: jest.fn().mockReturnValue(secret) } as any);
  return { guard, context, request };
}

const token = (claims: Record<string, unknown>, opts: { secret?: string; expiresIn?: number | string } = {}) =>
  jwt.sign(claims, { secret: opts.secret ?? SECRET, expiresIn: opts.expiresIn ?? 60 });

describe('BiometricGuard (issue #1537)', () => {
  it('requires the header', () => {
    const { guard, context } = build({});
    expect(() => guard.canActivate(context)).toThrow('Biometric token required');
  });

  it('refuses when biometric verification is not configured', () => {
    const { guard, context } = build({ 'x-biometric-token': 'x' }, 'u1', undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('accepts a valid, verified token for the authenticated user and records the attestation', () => {
    const { guard, context, request } = build({ 'x-biometric-token': token({ sub: 'u1', verified: true }) });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.biometric).toMatchObject({ verified: true });
  });

  it('refuses a token signed with another secret', () => {
    const { guard, context } = build({ 'x-biometric-token': token({ sub: 'u1', verified: true }, { secret: 'other-secret-other-secret-123456' }) });
    expect(() => guard.canActivate(context)).toThrow('Invalid or expired biometric token');
  });

  it('refuses verified:false', () => {
    const { guard, context } = build({ 'x-biometric-token': token({ sub: 'u1', verified: false }) });
    expect(() => guard.canActivate(context)).toThrow('Biometric attestation not verified');
  });

  it('refuses a token for a different user', () => {
    const { guard, context } = build({ 'x-biometric-token': token({ sub: 'someone-else', verified: true }) });
    expect(() => guard.canActivate(context)).toThrow('does not match authenticated user');
  });

  it('refuses an expired token', () => {
    const { guard, context } = build({ 'x-biometric-token': token({ sub: 'u1', verified: true }, { expiresIn: -10 }) });
    expect(() => guard.canActivate(context)).toThrow('Invalid or expired biometric token');
  });
});
