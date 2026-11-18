import { Test } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetFlowService } from './password-reset-flow.service';
import { DEFAULT_PASSWORD_POLICY, PasswordPolicyService } from './password-policy.service';

describe('AuthController (issue #1516)', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn().mockResolvedValue({ accessToken: 'a' }),
    login: jest.fn().mockResolvedValue({ accessToken: 'a' }),
    rotateRefreshToken: jest.fn().mockResolvedValue({ accessToken: 'b' }),
    logout: jest.fn().mockResolvedValue(undefined),
  };
  const flow = {
    forgotPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
  };
  const policy = { getPolicy: jest.fn().mockReturnValue({ ...DEFAULT_PASSWORD_POLICY, minLength: 14 }) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PasswordResetFlowService, useValue: flow },
        { provide: PasswordPolicyService, useValue: policy },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('GET password-policy is public and returns the effective policy', () => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.getPasswordPolicy);

    expect(isPublic).toBe(true);
    expect(controller.getPasswordPolicy()).toMatchObject({ minLength: 14 });
  });

  it('register and login pass the dto, ip and user agent to the service', async () => {
    await controller.register({ email: 'a@b.com' } as any, '1.1.1.1', 'jest');
    await controller.login({ email: 'a@b.com' } as any, '2.2.2.2', 'jest2');

    expect(authService.register).toHaveBeenCalledWith({ email: 'a@b.com' }, { ip: '1.1.1.1', userAgent: 'jest' });
    expect(authService.login).toHaveBeenCalledWith({ email: 'a@b.com' }, { ip: '2.2.2.2', userAgent: 'jest2' });
  });

  it('refresh forwards the token and request context', async () => {
    await controller.refresh('rt', '3.3.3.3', 'ua');
    expect(authService.rotateRefreshToken).toHaveBeenCalledWith('rt', { ip: '3.3.3.3', userAgent: 'ua' });
  });

  it('logout passes the user, the sid and the body token', async () => {
    await controller.logout('user-1', 'sid-9', 'rt-body');
    expect(authService.logout).toHaveBeenCalledWith('user-1', 'sid-9', 'rt-body');
  });

  it('forgot and reset delegate to the password reset flow', async () => {
    await controller.forgotPassword({ email: 'a@b.com' } as any);
    await controller.resetPassword({ token: 't', newPassword: 'n' } as any);

    expect(flow.forgotPassword).toHaveBeenCalledWith('a@b.com');
    expect(flow.resetPassword).toHaveBeenCalledWith('t', 'n');
  });
});
