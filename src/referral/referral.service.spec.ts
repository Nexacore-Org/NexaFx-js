import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { ReferralService } from './referral.service';
import { Referral, ReferralStatus } from './referral.entity';
import { ReferralCode } from './referral-code.entity';
import {
  ReferralReward,
  RewardStatus,
  RewardType,
} from './referral-reward.entity';
import { WalletsService } from '../wallet/wallets.service';
import { UsersService } from '../users/users.service';

const makeCode = (overrides: Partial<ReferralCode> = {}): ReferralCode =>
  ({
    id: 'code-1',
    ownerId: 'user-referrer',
    code: 'REF-ABCD1234',
    createdAt: new Date(),
    ...overrides,
  }) as ReferralCode;

const makeReferral = (overrides: Partial<Referral> = {}): Referral =>
  ({
    id: 'ref-1',
    referrerId: 'user-referrer',
    referredId: 'user-referee',
    referralCode: 'REF-ABCD1234',
    status: ReferralStatus.PENDING,
    createdAt: new Date(),
    ...overrides,
  }) as Referral;

describe('ReferralService', () => {
  let referralRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let codeRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let rewardRepo: { find: jest.Mock };
  let config: { get: jest.Mock };
  let wallets: { adjustBalance: jest.Mock };
  let users: { findById: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: {
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: ReferralService;

  beforeEach(() => {
    referralRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
    };
    codeRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
    };
    rewardRepo = { find: jest.fn().mockResolvedValue([]) };
    config = { get: jest.fn() };
    wallets = { adjustBalance: jest.fn().mockResolvedValue(undefined) };
    users = { findById: jest.fn().mockResolvedValue({ id: 'any' }) };
    manager = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((_entity, data) => ({ ...data })),
      save: jest.fn(async (_entity, value) => value),
    };
    dataSource = {
      transaction: jest.fn((cb) => cb(manager)),
    };

    service = new ReferralService(
      referralRepo as unknown as Repository<Referral>,
      codeRepo as unknown as Repository<ReferralCode>,
      rewardRepo as unknown as Repository<ReferralReward>,
      config as unknown as ConfigService,
      wallets as unknown as WalletsService,
      users as unknown as UsersService,
      dataSource as unknown as DataSource,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateCode', () => {
    it('returns the existing code without creating another row', async () => {
      codeRepo.findOne.mockResolvedValue(makeCode());

      await expect(service.generateCode('user-referrer')).resolves.toEqual(
        expect.objectContaining({ code: 'REF-ABCD1234' }),
      );
      expect(codeRepo.save).not.toHaveBeenCalled();
    });

    it('creates one code for a new owner', async () => {
      codeRepo.findOne.mockResolvedValue(null);

      const code = await service.generateCode('user-referrer');

      expect(code.code).toMatch(/^REF-[0-9A-F]{8}$/);
      expect(codeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'user-referrer' }),
      );
    });

    it('is idempotent across two calls', async () => {
      const existing = makeCode();
      codeRepo.findOne.mockResolvedValue(existing);

      const [a, b] = await Promise.all([
        service.generateCode('user-referrer'),
        service.generateCode('user-referrer'),
      ]);

      expect(a.code).toBe(b.code);
      expect(codeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('applyCode', () => {
    const active = (max = 100) =>
      config.get.mockImplementation((key: string) => {
        if (key === 'referral.programActive') return true;
        if (key === 'referral.maxReferrals') return max;
        return undefined;
      });

    it('rejects when the program is inactive', async () => {
      config.get.mockReturnValue(false);
      await expect(
        service.applyCode('REF-CODE', 'user-referee'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s for an unknown code', async () => {
      active();
      codeRepo.findOne.mockResolvedValue(null);
      await expect(
        service.applyCode('REF-NOPE', 'user-referee'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects self-referral', async () => {
      active();
      codeRepo.findOne.mockResolvedValue(makeCode({ ownerId: 'user-referee' }));

      await expect(
        service.applyCode('REF-ABCD1234', 'user-referee'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a referee that already has a referral', async () => {
      active();
      codeRepo.findOne.mockResolvedValue(makeCode());
      referralRepo.findOne.mockResolvedValue(makeReferral());

      await expect(
        service.applyCode('REF-ABCD1234', 'user-referee'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('inserts a new row for every referee while never mutating the previous one', async () => {
      active();
      codeRepo.findOne.mockResolvedValue(makeCode());
      referralRepo.findOne.mockResolvedValue(null);

      const first = await service.applyCode('REF-ABCD1234', 'referee-1');
      const second = await service.applyCode('REF-ABCD1234', 'referee-2');

      expect(first).toEqual(
        expect.objectContaining({
          referrerId: 'user-referrer',
          referredId: 'referee-1',
          status: ReferralStatus.PENDING,
        }),
      );
      expect(second).toEqual(
        expect.objectContaining({
          referrerId: 'user-referrer',
          referredId: 'referee-2',
          status: ReferralStatus.PENDING,
        }),
      );
      expect(referralRepo.save).toHaveBeenCalledTimes(2);
    });

    it('never resets a rewarded referral when the code is applied again', async () => {
      active();
      codeRepo.findOne.mockResolvedValue(makeCode());
      referralRepo.findOne.mockResolvedValue(null);
      referralRepo.save.mockImplementation(async (r) => r as Referral);

      await service.applyCode('REF-ABCD1234', 'new-referee');

      const saved = referralRepo.save.mock.calls[0]?.[0] as Referral;
      expect(saved.status).toBe(ReferralStatus.PENDING);
      expect(referralRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { referredId: 'new-referee' } }),
      );
    });

    it('enforces the referrer limit', async () => {
      active(2);
      codeRepo.findOne.mockResolvedValue(makeCode());
      referralRepo.findOne.mockResolvedValue(null);
      referralRepo.count.mockResolvedValue(2);

      await expect(
        service.applyCode('REF-ABCD1234', 'new-referee'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(referralRepo.save).not.toHaveBeenCalled();
    });

    it('turns a unique-violation race into a 400', async () => {
      active();
      codeRepo.findOne.mockResolvedValue(makeCode());
      referralRepo.findOne.mockResolvedValue(null);
      referralRepo.save.mockRejectedValue({ code: '23505' });

      await expect(
        service.applyCode('REF-ABCD1234', 'new-referee'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getStats', () => {
    it('counts each status and sums only PAID rewards', async () => {
      referralRepo.find.mockResolvedValue([
        makeReferral({ id: 'a', status: ReferralStatus.PENDING }),
        makeReferral({ id: 'b', status: ReferralStatus.QUALIFIED }),
        makeReferral({ id: 'c', status: ReferralStatus.REWARDED }),
      ]);
      rewardRepo.find.mockResolvedValue([
        { amount: 10, status: RewardStatus.PAID },
        { amount: 99, status: RewardStatus.PENDING },
      ] as ReferralReward[]);

      await expect(service.getStats('user-referrer')).resolves.toEqual({
        totalReferrals: 3,
        pending: 1,
        qualified: 1,
        rewarded: 1,
        totalRewardsPaid: 10,
      });
    });
  });

  describe('qualifyReferral', () => {
    it('moves PENDING to QUALIFIED and stamps qualifiedAt', async () => {
      referralRepo.findOne.mockResolvedValue(makeReferral());

      const result = await service.qualifyReferral('ref-1');

      expect(result.status).toBe(ReferralStatus.QUALIFIED);
      expect(result.qualifiedAt).toBeInstanceOf(Date);
    });

    it.each([ReferralStatus.QUALIFIED, ReferralStatus.REWARDED])(
      'rejects a %s referral with 400',
      async (status) => {
        referralRepo.findOne.mockResolvedValue(makeReferral({ status }));
        await expect(service.qualifyReferral('ref-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(referralRepo.save).not.toHaveBeenCalled();
      },
    );

    it('404s for an unknown referral', async () => {
      referralRepo.findOne.mockResolvedValue(null);
      await expect(service.qualifyReferral('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('rewardReferral', () => {
    const qualified = () => makeReferral({ status: ReferralStatus.QUALIFIED });

    const rewardConfig = () =>
      config.get.mockImplementation((key: string) => {
        if (key === 'referral.rewardAmount') return 25;
        if (key === 'referral.rewardCurrency') return 'NGN';
        if (key === 'referral.refereeRewardAmount') return 0;
        return undefined;
      });

    it('claims the row atomically, credits the configured currency and records a PAID reward', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      rewardConfig();

      const { referral, reward } = await service.rewardReferral('ref-1');

      expect(manager.update).toHaveBeenCalledWith(
        Referral,
        { id: 'ref-1', status: ReferralStatus.QUALIFIED },
        expect.objectContaining({ status: ReferralStatus.REWARDED }),
      );
      expect(wallets.adjustBalance).toHaveBeenCalledWith(
        'user-referrer',
        'NGN',
        25,
        manager,
      );
      expect(manager.create).toHaveBeenCalledWith(
        ReferralReward,
        expect.objectContaining({
          referralId: 'ref-1',
          recipientId: 'user-referrer',
          amount: 25,
          currency: 'NGN',
          rewardType: RewardType.CREDIT,
          status: RewardStatus.PAID,
        }),
      );
      expect(reward.status).toBe(RewardStatus.PAID);
      expect(referral.status).toBe(ReferralStatus.REWARDED);
    });

    it('defaults the amount to 10 and the currency to USD', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      config.get.mockReturnValue(undefined);

      await service.rewardReferral('ref-1');

      expect(wallets.adjustBalance).toHaveBeenCalledWith(
        'user-referrer',
        'USD',
        10,
        manager,
      );
    });

    it('rejects an unsupported reward currency before crediting anything', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      config.get.mockImplementation((key: string) => {
        if (key === 'referral.rewardAmount') return 25;
        if (key === 'referral.rewardCurrency') return 'DOGE';
        if (key === 'referral.refereeRewardAmount') return 0;
        return undefined;
      });

      await expect(service.rewardReferral('ref-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('pays exactly one credit when two reward calls race', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      rewardConfig();
      manager.update
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 0 });

      const results = await Promise.allSettled([
        service.rewardReferral('ref-1'),
        service.rewardReferral('ref-1'),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(wallets.adjustBalance).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledTimes(1);
    });

    it('optionally rewards the referee as a second recipient row', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      config.get.mockImplementation((key: string) => {
        if (key === 'referral.rewardAmount') return 25;
        if (key === 'referral.rewardCurrency') return 'USD';
        if (key === 'referral.refereeRewardAmount') return 5;
        return undefined;
      });

      await service.rewardReferral('ref-1');

      expect(wallets.adjustBalance).toHaveBeenCalledWith(
        'user-referee',
        'USD',
        5,
        manager,
      );
      expect(manager.save).toHaveBeenCalledTimes(2);
    });

    it.each([ReferralStatus.PENDING, ReferralStatus.REWARDED])(
      'rejects a %s referral with 400 before the transaction',
      async (status) => {
        referralRepo.findOne.mockResolvedValue(makeReferral({ status }));
        await expect(service.rewardReferral('ref-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(wallets.adjustBalance).not.toHaveBeenCalled();
      },
    );

    it('404s for an unknown referral', async () => {
      referralRepo.findOne.mockResolvedValue(null);
      await expect(service.rewardReferral('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('propagates an adjustBalance failure and marks nothing REWARDED', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      rewardConfig();
      wallets.adjustBalance.mockRejectedValue(new Error('wallet down'));

      await expect(service.rewardReferral('ref-1')).rejects.toThrow(
        'wallet down',
      );
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
