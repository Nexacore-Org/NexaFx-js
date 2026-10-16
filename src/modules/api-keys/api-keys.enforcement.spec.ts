import { BadRequestException, ExecutionContext, ForbiddenException, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiKeysService } from './services/api-keys.service';
import { ApiKeyAuthService } from './services/api-key-auth.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyScope, API_KEY_ALLOWED, API_KEY_REQUIRED_SCOPES } from './api-key-scopes';

const day = 86_400_000;

function serviceWith(overrides: { active?: number } = {}) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(overrides.active ?? 0),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'k1', createdAt: new Date(), ...v })),
    find: jest.fn(),
    update: jest.fn(),
  };
  return { service: new ApiKeysService(repo as any), repo };
}

describe('ApiKeysService creation limits (#1361)', () => {
  it('stores a display prefix and never exposes more than the plain key once', async () => {
    const { service, repo } = serviceWith();
    const { plainKey } = await service.createApiKey('u1', { name: 'ci' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ keyPrefix: plainKey.slice(0, 12) }));
  });

  it('caps rateLimit server-side', async () => {
    const { service, repo } = serviceWith();
    await service.createApiKey('u1', { name: 'ci', rateLimit: 5_000_000 });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ rateLimit: 10_000 }));
  });

  it('rejects an expiry in the past or beyond one year', async () => {
    const { service } = serviceWith();
    await expect(
      service.createApiKey('u1', { name: 'a', expiresAt: new Date(Date.now() - day).toISOString() }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createApiKey('u1', { name: 'b', expiresAt: new Date(Date.now() + 400 * day).toISOString() }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown scopes', async () => {
    const { service } = serviceWith();
    await expect(service.createApiKey('u1', { name: 'a', scopes: ['admin:everything'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('limits active keys per user to 10', async () => {
    const { service } = serviceWith({ active: 10 });
    await expect(service.createApiKey('u1', { name: 'one-too-many' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CreateApiKeyDto (#1361)', () => {
  const check = (body: object) => validate(plainToInstance(CreateApiKeyDto, body) as object);

  it('accepts only known scopes and a bounded rate limit', async () => {
    expect(await check({ name: 'ok', scopes: [ApiKeyScope.READ_BALANCES], rateLimit: 100 })).toHaveLength(0);
    expect(await check({ name: 'bad', scopes: ['everything'] })).not.toHaveLength(0);
    expect(await check({ name: 'bad', rateLimit: 999_999 })).not.toHaveLength(0);
  });
});

describe('ApiKeyAuthService (#1361)', () => {
  const key = (over: Record<string, unknown> = {}) => ({
    id: 'k1',
    userId: 'u1',
    scopes: [ApiKeyScope.READ_BALANCES],
    rateLimit: 2,
    ...over,
  });
  const build = (apiKey = key(), owner: any = { id: 'u1', email: 'a@b.c', role: 'user', isActive: true }) => {
    const keys = { validateApiKey: jest.fn().mockResolvedValue(apiKey) };
    const users = { findOne: jest.fn().mockResolvedValue(owner) };
    return new ApiKeyAuthService(keys as any, users as any);
  };

  it('produces the normalised principal with the key scopes', async () => {
    const user = await build().authenticate('nxf_x', [ApiKeyScope.READ_BALANCES]);
    expect(user).toMatchObject({ id: 'u1', sub: 'u1', role: 'user', authMethod: 'api_key', apiKeyId: 'k1' });
  });

  it('enforces scopes with 403', async () => {
    await expect(build().authenticate('nxf_x', [ApiKeyScope.WRITE_TRANSFERS])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('enforces the per-key hourly rate limit with 429', async () => {
    const svc = build();
    await svc.authenticate('nxf_x');
    await svc.authenticate('nxf_x');
    const err = await svc.authenticate('nxf_x').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
  });

  it('rejects keys whose owner is deactivated', async () => {
    await expect(build(key(), { id: 'u1', isActive: false }).authenticate('nxf_x')).rejects.toThrow();
  });
});

describe('ApiKeyAuthGuard (#1361)', () => {
  const ctx = (headers: Record<string, string>) => {
    const request: any = { headers };
    return {
      request,
      context: {
        getType: () => 'http',
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };
  const build = (allowed: boolean) => {
    const reflector = {
      getAllAndOverride: jest.fn((metaKey: string) =>
        metaKey === API_KEY_ALLOWED ? allowed : metaKey === API_KEY_REQUIRED_SCOPES ? [ApiKeyScope.READ_BALANCES] : undefined,
      ),
    } as unknown as Reflector;
    const auth = { authenticate: jest.fn().mockResolvedValue({ id: 'u1', authMethod: 'api_key' }) };
    return { guard: new ApiKeyAuthGuard(reflector, auth as any), auth };
  };

  it('authenticates an x-api-key request on an opted-in route', async () => {
    const { guard, auth } = build(true);
    const { context, request } = ctx({ 'x-api-key': 'nxf_x' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth.authenticate).toHaveBeenCalledWith('nxf_x', [ApiKeyScope.READ_BALANCES]);
    expect(request.user).toMatchObject({ authMethod: 'api_key' });
  });

  it('ignores API keys on routes that did not opt in', async () => {
    const { guard, auth } = build(false);
    const { context, request } = ctx({ 'x-api-key': 'nxf_x' });
    await guard.canActivate(context);
    expect(auth.authenticate).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('leaves bearer-token requests to the JWT guard', async () => {
    const { guard, auth } = build(true);
    const { context } = ctx({ 'x-api-key': 'nxf_x', authorization: 'Bearer abc' });
    await guard.canActivate(context);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });
});
