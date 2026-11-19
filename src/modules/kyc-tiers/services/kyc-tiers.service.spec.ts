import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { KycTiersService } from './kyc-tiers.service';
import { KycTier, User } from '../../../users/user.entity';
import { KycTierUpgradeEntity } from '../entities/kyc-tier-upgrade.entity';

function build(opts: { user?: Partial<User> | null; upgrade?: any } = {}) {
  let upgradeRow: any = opts.upgrade ? { ...opts.upgrade } : null;
  const userRow: any = opts.user === null ? null : { id: 'u1', kycTier: KycTier.NONE, ...(opts.user ?? {}) };

  // Atomic conditional update: only affects a row that is still in the expected status.
  const conditionalUpdate = jest.fn(async (_entity: unknown, where: any, patch: any) => {
    if (_entity === KycTierUpgradeEntity) {
      if (!upgradeRow || upgradeRow.status !== where.status) return { affected: 0 };
      Object.assign(upgradeRow, patch);
      return { affected: 1 };
    }
    Object.assign(userRow, patch);
    return { affected: 1 };
  });

  const manager = {
    findOne: jest.fn(async () => (upgradeRow ? { ...upgradeRow } : null)),
    update: conditionalUpdate,
  };
  const upgradeRepo = {
    findOne: jest.fn(async () => (upgradeRow ? { ...upgradeRow } : null)),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    update: jest.fn((where: any, patch: any) => conditionalUpdate(KycTierUpgradeEntity, where, patch)),
    manager: { transaction: jest.fn(async (cb: any) => cb(manager)) },
  };
  const userRepo = { findOne: jest.fn(async () => userRow) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const kyc = { isApproved: jest.fn().mockResolvedValue(true) };
  // approve() now locks and re-reads the user inside the transaction.
  manager.findOne = jest.fn(async (entity: unknown) => {
    if (entity === KycTierUpgradeEntity) return upgradeRow ? { ...upgradeRow } : null;
    return userRow;
  });
  const service = new KycTiersService(
    upgradeRepo as any,
    userRepo as any,
    audit as any,
    events as any,
    kyc as any,
  );
  return { service, upgradeRepo, userRow, manager, audit, events, kyc, getUpgrade: () => upgradeRow };
}

const pending = {
  id: 'req-1',
  userId: 'u1',
  currentTier: KycTier.NONE,
  requestedTier: KycTier.BASIC,
  status: 'pending',
  documents: {},
};

describe('KycTiersService', () => {
  it('rejects a new request when one is already pending', async () => {
    const { service, upgradeRepo } = build({ user: { kycTier: KycTier.BASIC } });
    upgradeRepo.findOne.mockResolvedValue({ id: 'req-1', status: 'pending' });
    await expect(service.requestUpgrade('u1', { requestedTier: KycTier.ADVANCED })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('records the real current tier from User.kycTier on the request', async () => {
    const { service, upgradeRepo } = build({ user: { kycTier: KycTier.BASIC } });
    upgradeRepo.findOne.mockResolvedValue(null);
    await service.requestUpgrade('u1', { requestedTier: KycTier.ADVANCED });
    expect(upgradeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ currentTier: KycTier.BASIC, requestedTier: KycTier.ADVANCED }),
    );
  });

  it('refuses a tier at or below the current one and tier jumps of more than one level', async () => {
    const { service, upgradeRepo } = build({ user: { kycTier: KycTier.BASIC } });
    upgradeRepo.findOne.mockResolvedValue(null);
    await expect(service.requestUpgrade('u1', { requestedTier: KycTier.BASIC })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.requestUpgrade('u1', { requestedTier: KycTier.VERIFIED })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when the user does not exist', async () => {
    const { service } = build({ user: null });
    await expect(service.requestUpgrade('ghost', { requestedTier: KycTier.BASIC })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('approving persists the tier on User.kycTier and records the authenticated reviewer', async () => {
    const { service, userRow, getUpgrade } = build({ upgrade: { ...pending, requestedTier: KycTier.ADVANCED } });
    await service.approve('req-1', 'admin-1');
    expect(userRow.kycTier).toBe(KycTier.ADVANCED);
    expect(getUpgrade()).toMatchObject({ status: 'approved', reviewedBy: 'admin-1' });
  });

  it('returns 409 and leaves the tier alone when the request was already reviewed', async () => {
    const { service, userRow } = build({ upgrade: { ...pending, status: 'approved' } });
    await expect(service.approve('req-1', 'admin-2')).rejects.toBeInstanceOf(ConflictException);
    expect(userRow.kycTier).toBe(KycTier.NONE);
  });

  it('two concurrent approvals: exactly one wins, the other gets 409', async () => {
    const { service, manager } = build({ upgrade: pending });
    const results = await Promise.allSettled([
      service.approve('req-1', 'admin-1'),
      service.approve('req-1', 'admin-2'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ConflictException);
    const tierUpdates = manager.update.mock.calls.filter((c) => c[0] === User);
    expect(tierUpdates).toHaveLength(1);
  });

  it('404s approving an unknown request', async () => {
    const { service } = build();
    await expect(service.approve('nope', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejecting leaves the tier unchanged and cannot be repeated', async () => {
    const { service, userRow } = build({ upgrade: pending });
    await service.reject('req-1', 'admin-1', 'insufficient docs');
    expect(userRow.kycTier).toBe(KycTier.NONE);
    await expect(service.reject('req-1', 'admin-2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('getStatus returns the latest upgrade record for the user', async () => {
    const { service } = build({ upgrade: pending });
    await expect(service.getStatus('u1')).resolves.toMatchObject({ userId: 'u1' });
  });
});

describe('KycTiersService — audit, staleness and identity checks (issue #1522)', () => {
  it('rejects a stale request whose user tier changed after it was filed (409, no write)', async () => {
    const { service, userRow, manager } = build({
      user: { kycTier: KycTier.BASIC },
      upgrade: { ...pending, currentTier: KycTier.NONE, requestedTier: KycTier.BASIC },
    });

    await expect(service.approve('req-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);

    expect(userRow.kycTier).toBe(KycTier.BASIC);
    expect(manager.update.mock.calls.filter((c: unknown[]) => c[0] === User)).toHaveLength(0);
  });

  it('refuses tiers above BASIC when the identity is not approved', async () => {
    const { service, kyc, userRow } = build({
      user: { kycTier: KycTier.BASIC },
      upgrade: { ...pending, currentTier: KycTier.BASIC, requestedTier: KycTier.ADVANCED },
    });
    kyc.isApproved.mockResolvedValue(false);

    await expect(service.approve('req-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(userRow.kycTier).toBe(KycTier.BASIC);
  });

  it('does not require an approved identity document for BASIC', async () => {
    const { service, kyc } = build({ upgrade: pending });
    kyc.isApproved.mockResolvedValue(false);

    await expect(service.approve('req-1', 'admin-1')).resolves.toMatchObject({ status: 'approved' });
  });

  it('writes an audit entry and emits kyc.tier.changed on approve', async () => {
    const { service, audit, events } = build({ upgrade: pending });

    await service.approve('req-1', 'admin-1');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'kyc.tier.approved',
        before: expect.objectContaining({ tier: KycTier.NONE }),
        after: expect.objectContaining({ tier: KycTier.BASIC }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith('kyc.tier.changed', expect.objectContaining({ decision: 'approved' }));
  });

  it('writes an audit entry with the reason on reject', async () => {
    const { service, audit } = build({ upgrade: pending });

    await service.reject('req-1', 'admin-1', 'blurry photo');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kyc.tier.rejected', reason: 'blurry photo' }),
    );
  });

  it('audits the request itself', async () => {
    const { service, upgradeRepo, audit } = build({ user: { kycTier: KycTier.BASIC } });
    upgradeRepo.findOne.mockResolvedValue(null);
    upgradeRepo.save.mockResolvedValue({ id: 'new-1' });

    await service.requestUpgrade('u1', { requestedTier: KycTier.ADVANCED });

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'kyc.tier.requested', entityId: 'new-1' }));
  });

  it('lists only the caller\'s own requests, paginated', async () => {
    const { service, upgradeRepo } = build();
    (upgradeRepo as any).findAndCount = jest.fn().mockResolvedValue([[{ id: 'r1' }], 1]);

    const page = await service.listOwnUpgrades('u1', 2, 5);

    expect((upgradeRepo as any).findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, skip: 5, take: 5 }),
    );
    expect(page).toEqual({ data: [{ id: 'r1' }], total: 1, page: 2, limit: 5 });
  });
});
