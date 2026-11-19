import { BadRequestException } from '@nestjs/common';
import { PasswordResetService, INVALID_RESET_TOKEN_MESSAGE } from './password-reset.service';

/** A fake query builder that behaves like the one conditional UPDATE: only one claim can win. */
function build(initial: { used?: boolean; expired?: boolean; attempts?: number } = {}) {
  const row = { used: initial.used ?? false, expired: initial.expired ?? false, attempts: initial.attempts ?? 0, userId: 'user-1' };
  const execute = jest.fn(async () => {
    if (row.used || row.expired || row.attempts >= 3) return { affected: 0, raw: [] };
    row.used = true;
    return { affected: 1, raw: [{ userId: row.userId }] };
  });
  const qb: any = {};
  for (const m of ['update', 'set', 'where', 'andWhere', 'returning']) qb[m] = jest.fn(() => qb);
  qb.execute = execute;
  const repo: any = { createQueryBuilder: jest.fn(() => qb), manager: { transaction: jest.fn(async (fn: any) => fn({ tx: true })) } };
  const service = new PasswordResetService(repo);
  return { service, qb, repo, row };
}

describe('PasswordResetService.claimToken (issue #1526)', () => {
  it('claims a valid token and returns its user', async () => {
    const { service, qb } = build();
    await expect(service.claimToken('raw')).resolves.toBe('user-1');
    expect(qb.set).toHaveBeenCalledWith({ used: true });
  });

  it('two concurrent claims of the same token: exactly one wins', async () => {
    const { service } = build();

    const results = await Promise.allSettled([service.claimToken('raw'), service.claimToken('raw')]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it.each([
    ['used', { used: true }],
    ['expired', { expired: true }],
    ['out of attempts', { attempts: 3 }],
  ])('a %s token fails with the same generic 400', async (_label, state) => {
    const { service } = build(state);
    const err = await service.claimToken('raw').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe(INVALID_RESET_TOKEN_MESSAGE);
  });

  it('uses the caller\'s transaction manager when given', async () => {
    const { service } = build();
    const innerQb: any = {};
    for (const m of ['update', 'set', 'where', 'andWhere', 'returning']) innerQb[m] = jest.fn(() => innerQb);
    innerQb.execute = jest.fn().mockResolvedValue({ affected: 1, raw: [{ userId: 'user-9' }] });
    const manager: any = { getRepository: jest.fn(() => ({ createQueryBuilder: () => innerQb })) };

    await expect(service.claimToken('raw', manager)).resolves.toBe('user-9');
    expect(manager.getRepository).toHaveBeenCalled();
  });
});
