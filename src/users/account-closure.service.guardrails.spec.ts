import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AccountClosureService } from './account-closure.service';
import { ApiKeyEntity } from '../modules/api-keys/entities/api-key.entity';
import { ScheduledTransaction } from '../modules/scheduled-transactions/scheduled-transaction.entity';
import { DisputeEntity } from '../disputes/entities/dispute.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TOKEN_VERSION_CHANGED_EVENT } from '../auth/token-version.service';
import { USER_ACCESS_CHANGED_EVENT } from '../auth/account-status.service';

/** Issue #1530 */
const BCRYPT = '$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz0123';

function build(opts: { verify?: boolean; frozen?: boolean; disputes?: number; pending?: number } = {}) {
  const user = { id: 'u1', email: 'a@b.c', firstName: 'Ada', lastName: 'L', isActive: true, tokenVersion: 4, passwordHash: BCRYPT };
  const tx = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const manager = {
    transaction: jest.fn(async (cb: (m: typeof tx) => unknown) => cb(tx)),
    count: jest.fn(async (entity: unknown) => (entity === DisputeEntity ? (opts.disputes ?? 0) : entity === Transaction ? (opts.pending ?? 0) : 0)),
  };
  const repo = { findOne: jest.fn().mockResolvedValue(user), manager };
  const usersService = { recordFailedLogin: jest.fn().mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null }) };
  const freeze = { isAccountFrozen: jest.fn().mockResolvedValue(opts.frozen ?? false) };
  const events = { emit: jest.fn() };
  const tokens = { revokeUserTokens: jest.fn() };
  const service = new AccountClosureService(
    repo as any,
    { verify: jest.fn().mockResolvedValue(opts.verify ?? true) } as any,
    { getBalancesForAccount: jest.fn().mockResolvedValue([{ balance: 0 }]) } as any,
    tokens as any,
    { sendFinalConfirmation: jest.fn().mockResolvedValue(undefined) } as any,
    { log: jest.fn() } as any,
    usersService as any,
    freeze as any,
    events as any,
  );
  return { service, tx, usersService, events, tokens };
}

describe('AccountClosureService guardrails (issue #1530)', () => {
  it('counts a wrong password against the lockout counter', async () => {
    const { service, usersService, tx } = build({ verify: false });

    await expect(service.closeAccount('u1', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);

    expect(usersService.recordFailedLogin).toHaveBeenCalledWith('u1', 5, 30);
    expect(tx.softDelete).not.toHaveBeenCalled();
  });

  it('refuses a frozen account', async () => {
    const { service, tx } = build({ frozen: true });
    await expect(service.closeAccount('u1', 'pw')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.softDelete).not.toHaveBeenCalled();
  });

  it('refuses while a dispute is open or under review', async () => {
    const { service } = build({ disputes: 1 });
    await expect(service.closeAccount('u1', 'pw')).rejects.toThrow(/disputes/);
  });

  it('refuses while a transaction is pending', async () => {
    const { service } = build({ pending: 2 });
    await expect(service.closeAccount('u1', 'pw')).rejects.toThrow(/pending transactions/);
  });

  it('closes in one transaction: bumps tokenVersion, revokes API keys, cancels schedules', async () => {
    const { service, tx } = build();

    await service.closeAccount('u1', 'pw');

    const updates = tx.update.mock.calls;
    expect(updates.find((c) => c[1] === 'u1')?.[2]).toMatchObject({ isActive: false, tokenVersion: 5 });
    expect(updates.some((c) => c[0] === ApiKeyEntity && c[2].isActive === false)).toBe(true);
    expect(updates.some((c) => c[0] === ScheduledTransaction && c[2].status === 'CANCELLED')).toBe(true);
    expect(tx.softDelete).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('makes existing access tokens stop working: token-version and access-changed events, refresh tokens revoked', async () => {
    const { service, events, tokens } = build();

    await service.closeAccount('u1', 'pw');

    expect(events.emit).toHaveBeenCalledWith(TOKEN_VERSION_CHANGED_EVENT, { userId: 'u1' });
    expect(events.emit).toHaveBeenCalledWith(USER_ACCESS_CHANGED_EVENT, expect.objectContaining({ revokeTokens: true }));
    expect(tokens.revokeUserTokens).toHaveBeenCalledWith('u1');
  });
});
