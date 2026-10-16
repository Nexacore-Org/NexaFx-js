import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { ReferralService } from './referral.service';
import { Referral, ReferralStatus } from './referral.entity';
import { ReferralReward, RewardStatus, RewardType } from './referral-reward.entity';
import { WalletsService } from '../wallet/wallets.service';
import { UsersService } from '../users/users.service';

const makeReferral = (overrides: Partial<Referral> = {}): Referral =>
  ({
    id: 'ref-1',
    referrerId: 'user-referrer',
    referredId: 'user-referrer',
    referralCode: 'REF-ABCD1234-XYZ',
    status: ReferralStatus.PENDING,
    createdAt: new Date(),
    ...overrides,
  }) as Referral;

describe('ReferralService', () => {
  let referralRepo: jest.Mocked<Pick<Repository<Referral>, 'findOne' | 'find' | 'count' | 'create' | 'save'>>;
  let rewardRepo: jest.Mocked<Pick<Repository<ReferralReward>, 'find'>>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let wallets: jest.Mocked<Pick<WalletsService, 'adjustBalance'>>;
  let users: jest.Mocked<Pick<UsersService, 'findById'>>;
  let dataSource: { transaction: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock };
  let service: ReferralService;

  beforeEach(() => {
    referralRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    rewardRepo = { find: jest.fn().mockResolvedValue([]) };
    config = { get: jest.fn() };
    wallets = { adjustBalance: jest.fn().mockResolvedValue(undefined) } as unknown as typeof wallets;
    users = { findById: jest.fn().mockResolvedValue({ id: 'any' }) } as unknown as typeof users;
    manager = {
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
      save: jest.fn(async (_entity: unknown, value: unknown) => value),
    };
    dataSource = { transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) => cb(manager)) };

    service = new ReferralService(
      referralRepo as unknown as Repository<Referral>,
      rewardRepo as unknown as Repository<ReferralReward>,
      config as unknown as ConfigService,
      wallets as unknown as WalletsService,
      users as unknown as UsersService,
      dataSource as unknown as DataSource,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('applyCode', () => {
    it('throws BadRequestException when the program is inactive', async () => {
      config.get.mockImplementation((key: string) => (key === 'referral.programActive' ? false : 100));
      await expect(service.applyCode('REF-CODE', 'user-referee')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the referral code does not exist', async () => {
      config.get.mockImplementation((key: string) => (key === 'referral.programActive' ? true : 100));
      referralRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      await expect(service.applyCode('INVALID-CODE', 'user-referee')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a user who has already been referred', async () => {
      config.get.mockImplementation((key: string) => (key === 'referral.programActive' ? true : 100));
      referralRepo.findOne.mockResolvedValueOnce(makeReferral({ referredId: 'user-referee' }));
      await expect(service.applyCode('REF-ABCD1234-XYZ', 'user-referee')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('links the referee when a valid code is applied', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'referral.programActive' ? true : key === 'referral.maxReferrals' ? 100 : undefined,
      );
      const code = makeReferral();
      referralRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(code);
      referralRepo.count.mockResolvedValue(0);
      referralRepo.save.mockImplementation(async (r) => r as Referral);

      const result = await service.applyCode('REF-ABCD1234-XYZ', 'new-referee');

      expect(result.referredId).toBe('new-referee');
      expect(result.status).toBe(ReferralStatus.PENDING);
      expect(referralRepo.save).toHaveBeenCalled();
    });

    it('rejects when the referrer has reached the limit', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'referral.programActive' ? true : key === 'referral.maxReferrals' ? 2 : undefined,
      );
      referralRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeReferral());
      referralRepo.count.mockResolvedValue(2);
      await expect(service.applyCode('REF-ABCD1234-XYZ', 'new-referee')).rejects.toBeInstanceOf(BadRequestException);
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
      referralRepo.save.mockImplementation(async (r) => r as Referral);

      const result = await service.qualifyReferral('ref-1');

      expect(result.status).toBe(ReferralStatus.QUALIFIED);
      expect(result.qualifiedAt).toBeInstanceOf(Date);
    });

    it.each([ReferralStatus.QUALIFIED, ReferralStatus.REWARDED])('rejects a %s referral with 400', async (status) => {
      referralRepo.findOne.mockResolvedValue(makeReferral({ status }));
      await expect(service.qualifyReferral('ref-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(referralRepo.save).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown referral', async () => {
      referralRepo.findOne.mockResolvedValue(null);
      await expect(service.qualifyReferral('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rewardReferral', () => {
    const qualified = () => makeReferral({ status: ReferralStatus.QUALIFIED });

    it('moves QUALIFIED to REWARDED, credits the wallet inside the transaction and records a PAID reward', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      config.get.mockImplementation((key: string) => (key === 'referral.rewardAmount' ? 25 : undefined));

      const { referral, reward } = await service.rewardReferral('ref-1');

      expect(wallets.adjustBalance).toHaveBeenCalledWith('user-referrer', 'USD', 25, manager);
      expect(manager.create).toHaveBeenCalledWith(
        ReferralReward,
        expect.objectContaining({ referralId: 'ref-1', rewardType: RewardType.CREDIT, amount: 25, status: RewardStatus.PAID }),
      );
      expect(reward.status).toBe(RewardStatus.PAID);
      expect(referral.status).toBe(ReferralStatus.REWARDED);
      expect(referral.rewardedAt).toBeInstanceOf(Date);
    });

    it('defaults the reward to 10 when referral.rewardAmount is not configured', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      config.get.mockReturnValue(undefined);
      await service.rewardReferral('ref-1');
      expect(wallets.adjustBalance).toHaveBeenCalledWith('user-referrer', 'USD', 10, manager);
    });

    it.each([ReferralStatus.PENDING, ReferralStatus.REWARDED])('rejects a %s referral with 400', async (status) => {
      referralRepo.findOne.mockResolvedValue(makeReferral({ status }));
      await expect(service.rewardReferral('ref-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(wallets.adjustBalance).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown referral', async () => {
      referralRepo.findOne.mockResolvedValue(null);
      await expect(service.rewardReferral('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates an adjustBalance failure and marks nothing REWARDED', async () => {
      referralRepo.findOne.mockResolvedValue(qualified());
      wallets.adjustBalance.mockRejectedValue(new Error('wallet down'));

      await expect(service.rewardReferral('ref-1')).rejects.toThrow('wallet down');
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
