import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { AccountClosureService, PII_RETENTION_YEARS } from './account-closure.service';
import { AccountClosurePurgeJob } from './account-closure.purge.job';

const BCRYPT = '$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz0123';

function build(opts: { user?: any; verify?: boolean; balances?: Array<{ balance: number }> } = {}) {
  const user = opts.user === undefined
    ? { id: 'u1', email: 'a@b.c', firstName: 'Ada', lastName: 'L', isActive: true, passwordHash: BCRYPT }
    : opts.user;
  const repo = {
    findOne: jest.fn().mockResolvedValue(user),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn(),
  };
  const passwords = { verify: jest.fn().mockResolvedValue(opts.verify ?? true) };
  const wallets = { getBalancesForAccount: jest.fn().mockResolvedValue(opts.balances ?? [{ balance: 0 }]) };
  const tokens = { revokeUserTokens: jest.fn() };
  const mailer = { sendFinalConfirmation: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn() };
  const service = new AccountClosureService(
    repo as any, passwords as any, wallets as any, tokens as any, mailer as any, audit as any,
  );
  return { service, repo, passwords, wallets, tokens, mailer, audit };
}

describe('AccountClosureService (users table)', () => {
  it('closes a real user: soft-deletes, schedules the purge, revokes sessions, audits and emails', async () => {
    const { service, repo, tokens, audit, mailer } = build();
    const result = await service.closeAccount('u1', 'correct-horse');

    expect(result.closed).toBe(true);
    expect(result.piiPurgeAt.getFullYear()).toBe(result.deletedAt.getFullYear() + PII_RETENTION_YEARS);
    expect(repo.update).toHaveBeenCalledWith('u1', expect.objectContaining({ isActive: false }));
    expect(repo.softDelete).toHaveBeenCalledWith('u1');
    expect(tokens.revokeUserTokens).toHaveBeenCalledWith('u1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'account.closed' }));
    expect(mailer.sendFinalConfirmation).toHaveBeenCalled();
  });

  it('rejects a wrong password without changing anything', async () => {
    const { service, repo } = build({ verify: false });
    await expect(service.closeAccount('u1', 'nope')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('rejects an unknown or already inactive account', async () => {
    await expect(build({ user: null }).service.closeAccount('u1', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(build({ user: { id: 'u1', isActive: false, passwordHash: BCRYPT } }).service.closeAccount('u1', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses closure while a balance remains', async () => {
    const { service, repo } = build({ balances: [{ balance: 0 }, { balance: 12.5 }] });
    await expect(service.closeAccount('u1', 'pw')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('stays closed when the confirmation email fails', async () => {
    const { service, mailer } = build();
    mailer.sendFinalConfirmation.mockRejectedValue(new Error('smtp down'));
    await expect(service.closeAccount('u1', 'pw')).resolves.toMatchObject({ closed: true });
  });
});

describe('AccountClosurePurgeJob', () => {
  it('anonymises users past their retention date, including soft-deleted rows', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const job = new AccountClosurePurgeJob(repo as any);

    await expect(job.purgeExpiredPersonalData()).resolves.toBe(2);
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
    expect(repo.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ email: 'deleted-u1@archived.local', firstName: '[deleted]', piiPurgedAt: expect.any(Date) }),
    );
  });
});
