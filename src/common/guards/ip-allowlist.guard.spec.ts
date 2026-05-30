import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { IpAllowlistGuard } from './ip-allowlist.guard';

describe('IpAllowlistGuard', () => {
  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;
  const guard = new IpAllowlistGuard(config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests when the allowlist is not configured', () => {
    (config.get as jest.Mock).mockReturnValue([]);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks requests outside allowlisted cidrs', () => {
    (config.get as jest.Mock).mockReturnValue(['10.0.0.0/8']);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '192.168.1.10' }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(
      'IP address is not allowlisted for admin access',
    );
  });
});
