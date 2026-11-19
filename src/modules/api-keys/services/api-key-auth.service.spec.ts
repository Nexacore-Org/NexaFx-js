import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { ApiKeyScope } from '../api-key-scopes';
import { ApiKeyAuthService } from './api-key-auth.service';

/** Issue #1537 */
const owner = { id: 'u1', email: 'a@b.c', role: 'user', isActive: true };

function build(over: { key?: Record<string, unknown>; owner?: any; validate?: jest.Mock } = {}) {
  const key = { id: 'k1', userId: 'u1', scopes: [ApiKeyScope.READ_BALANCES], rateLimit: 2, ...(over.key ?? {}) };
  const keys = { validateApiKey: over.validate ?? jest.fn().mockResolvedValue(key) };
  const users = { findOne: jest.fn().mockResolvedValue(over.owner === undefined ? owner : over.owner) };
  return { service: new ApiKeyAuthService(keys as any, users as any), keys };
}

describe('ApiKeyAuthService (issue #1537)', () => {
  afterEach(() => jest.useRealTimers());

  it('rejects an unknown or expired key with 401 (from validateApiKey)', async () => {
    const validate = jest.fn().mockRejectedValue(new UnauthorizedException('API key expired'));
    await expect(build({ validate }).service.authenticate('nxf_x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a missing scope with 403 and does not consume rate limit', async () => {
    const { service } = build();
    await expect(service.authenticate('nxf_x', [ApiKeyScope.WRITE_TRANSFERS])).rejects.toBeInstanceOf(ForbiddenException);
    // Both of the two allowed requests are still available afterwards.
    await service.authenticate('nxf_x', [ApiKeyScope.READ_BALANCES]);
    await service.authenticate('nxf_x', [ApiKeyScope.READ_BALANCES]);
  });

  it('refuses an inactive owner with 401', async () => {
    const { service } = build({ owner: { ...owner, isActive: false } });
    await expect(service.authenticate('nxf_x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a missing owner with 401', async () => {
    const { service } = build({ owner: null });
    await expect(service.authenticate('nxf_x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enforces the hourly rate limit with 429 and resets the window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { service } = build();

    await service.authenticate('nxf_x');
    await service.authenticate('nxf_x');
    const blocked = await service.authenticate('nxf_x').catch((e) => e);
    expect(blocked).toBeInstanceOf(HttpException);
    expect(blocked.getStatus()).toBe(429);

    jest.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    await expect(service.authenticate('nxf_x')).resolves.toMatchObject({ authMethod: 'api_key' });
  });

  it('tracks limits per key', async () => {
    const { service } = build();
    await service.authenticate('nxf_x');
    await service.authenticate('nxf_x');
    const other = build({ key: { id: 'k2' } }).service;
    await expect(other.authenticate('nxf_y')).resolves.toBeDefined();
  });
});
