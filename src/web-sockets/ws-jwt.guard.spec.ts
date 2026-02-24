import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from '../guards/ws-jwt.guard';

const makeContext = (socketOverrides: Record<string, any> = {}): ExecutionContext =>
  ({
    switchToWs: () => ({
      getClient: () => ({
        handshake: {
          headers: {},
          auth: {},
          query: {},
        },
        ...socketOverrides,
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext);

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsJwtGuard,
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('jwt-secret') },
        },
      ],
    }).compile();

    guard = module.get<WsJwtGuard>(WsJwtGuard);
    jwtService = module.get(JwtService);
  });

  it('should return true and attach user for valid Bearer token in auth', async () => {
    const user = { sub: 'user-1', roles: ['user'] };
    jwtService.verifyAsync.mockResolvedValue(user);

    const client: any = {
      handshake: { headers: {}, auth: { token: 'Bearer valid.token' }, query: {} },
    };
    const ctx = {
      switchToWs: () => ({ getClient: () => client }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(client.user).toEqual(user);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid.token', expect.any(Object));
  });

  it('should accept raw token (no Bearer prefix)', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-2' });
    const client: any = {
      handshake: { headers: {}, auth: { token: 'raw.token.here' }, query: {} },
    };
    const ctx = { switchToWs: () => ({ getClient: () => client }) } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should read token from Authorization header', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-3' });
    const client: any = {
      handshake: {
        headers: { authorization: 'Bearer header.token' },
        auth: {},
        query: {},
      },
    };
    const ctx = { switchToWs: () => ({ getClient: () => client }) } as unknown as ExecutionContext;

    await guard.canActivate(ctx);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('header.token', expect.any(Object));
  });

  it('should read token from query params', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-4' });
    const client: any = {
      handshake: { headers: {}, auth: {}, query: { token: 'query.token' } },
    };
    const ctx = { switchToWs: () => ({ getClient: () => client }) } as unknown as ExecutionContext;

    await guard.canActivate(ctx);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('query.token', expect.any(Object));
  });

  it('should throw WsException when no token present', async () => {
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(WsException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Missing authentication token');
  });

  it('should throw WsException for invalid/expired token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const client: any = {
      handshake: { headers: {}, auth: { token: 'expired.token' }, query: {} },
    };
    const ctx = { switchToWs: () => ({ getClient: () => client }) } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toThrow(WsException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired token');
  });
});
