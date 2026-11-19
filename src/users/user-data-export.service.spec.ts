import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { rmSync } from 'fs';
import { UserDataExportService, toPublicProfile, USER_EXPORT_SECTIONS } from './user-data-export.service';

/** Issue #1531 */
const fullUser = {
  id: 'u1',
  email: 'a@b.c',
  firstName: 'Ada',
  lastName: 'L',
  isEmailVerified: true,
  kycStatus: 'approved',
  kycTier: 'BASIC',
  createdAt: new Date('2026-01-01'),
  // Internal state that must never be exported:
  passwordHash: '$2a$hash',
  tokenVersion: 9,
  failedLoginAttempts: 3,
  lockedUntil: new Date(),
  require2fa: true,
  piiPurgeAt: new Date(),
  passwordChangedAt: new Date(),
};

function build() {
  const manager = {
    find: jest.fn(async (entity: { name?: string }) =>
      entity.name === 'Transaction'
        ? [{ id: 't1', senderId: 'u1', receiverId: 'u2', amount: 5, currency: 'USD', fee: 0, status: 'completed', reference: 'r', receiptNumber: 'n', createdAt: new Date(), internalNote: 'hidden' }]
        : [{ id: 'a1', action: 'auth.login', entityType: 'user', entityId: 'u1', ipAddress: '1.1.1.1', createdAt: new Date(), before: { secret: 'x' } }],
    ),
  };
  const users = { findOneOrFail: jest.fn().mockResolvedValue(fullUser), manager };
  const wallets = { getBalancesForAccount: jest.fn().mockResolvedValue([{ currency: 'USD', balance: 10, isPrimary: true, keyVersion: 2, encryptedSecret: 'zzz' }]) };
  const jwt = new JwtService({});
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const mail = { notifyExportReady: jest.fn() };
  const service = new UserDataExportService(
    users as any,
    wallets as any,
    jwt,
    { get: jest.fn().mockReturnValue('jwt-secret-for-tests-0123456789') } as any,
    audit as any,
    mail as any,
  );
  return { service, audit, mail };
}

describe('toPublicProfile (issue #1531)', () => {
  it('exports only the allow-listed fields', () => {
    expect(Object.keys(toPublicProfile(fullUser as any)).sort()).toEqual(
      ['createdAt', 'email', 'firstName', 'id', 'isEmailVerified', 'kycStatus', 'kycTier', 'lastName'].sort(),
    );
  });

  it('never carries security counters or hashes', () => {
    const text = JSON.stringify(toPublicProfile(fullUser as any));
    for (const forbidden of ['passwordHash', 'tokenVersion', 'failedLoginAttempts', 'lockedUntil', 'require2fa', 'piiPurgeAt', 'passwordChangedAt']) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('UserDataExportService (issue #1531)', () => {
  afterAll(() => rmSync('tmp/exports/user-data', { recursive: true, force: true }));

  it('collects only the allow-listed columns from wallets, transactions and audit rows', async () => {
    const { service } = build();

    const data = await service.collect('u1');

    expect(JSON.stringify(data)).not.toMatch(/internalNote|encryptedSecret|keyVersion|passwordHash|"before"/);
    expect(data.transactions[0]).toMatchObject({ id: 't1', direction: 'sent' });
    expect(data.wallets[0]).toEqual({ currency: 'USD', balance: 10, isPrimary: true });
  });

  it('returns a random uuid export id, lists the sections that are really collected, audits and notifies', async () => {
    const { service, audit, mail } = build();

    const first = await service.request('u1');
    const second = await service.request('u1');

    expect(first.exportId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.exportId).not.toBe(second.exportId);
    expect(first.exportId).not.toContain('u1');
    expect(first.sections).toEqual([...USER_EXPORT_SECTIONS]);
    expect(first.sections).not.toContain('notification_preferences');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.data_export.requested', entityId: 'u1' }));
    expect(mail.notifyExportReady).toHaveBeenCalled();
  });

  it('the link only works for the same user and export', async () => {
    const { service } = build();
    const { exportId, downloadUrl } = await service.request('u1');
    const token = new URL(`http://x${downloadUrl}`).searchParams.get('token') as string;

    expect(service.resolve('u1', exportId, token)).toContain(exportId);
    expect(() => service.resolve('u2', exportId, token)).toThrow(ForbiddenException);
    expect(() => service.resolve('u1', '00000000-0000-4000-8000-000000000000', token)).toThrow(ForbiddenException);
    expect(() => service.resolve('u1', exportId, 'garbage')).toThrow(ForbiddenException);
  });
});
