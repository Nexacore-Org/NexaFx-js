import { Repository, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReferralService } from './referral.service';
import { Referral } from './referral.entity';
import { WalletsService } from '../wallet/wallets.service';

const makeReferral = (overrides: Partial<Referral> = {}): Referral =>
  ({
    id: 'ref-1',
    referrerId: 'user-referrer',
    refereeId: 'user-referee',
    code: 'REF-ABCD1234-XYZ',
    rewardPaid: false,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as Referral);

describe('ReferralService', () => {
  let referralRepo: jest.Mocked<Pick<Repository<Referral>, 'findOne' | 'find' | 'count' | 'create' | 'save'>>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let wallets: jest.Mocked<Pick<WalletsService, 'adjustBalance'>>;
  let dataSource: { transaction: jest.Mock };
  let service: ReferralService;

  beforeEach(() => {
    referralRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    config = { get: jest.fn() };
    wallets = { adjustBalance: jest.fn().mockResolvedValue(undefined) };
    dataSource = { transaction: jest.fn() };

    service = new ReferralService(
      referralRepo as unknown as Repository<Referral>,
      config as unknown as ConfigService,
      wallets as unknown as WalletsService,
      dataSource as unknown as DataSource,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // creditRewardOnFirstTransaction
  // ---------------------------------------------------------------------------

  describe('creditRewardOnFirstTransaction', () => {
    it('credits wallet, sets rewardPaid=true, and saves when referral exists', async () => {
      const referral = makeReferral({ rewardPaid: false });
      const manager = {
        findOne: jest.fn().mockResolvedValue(referral),
        save: jest.fn().mockResolvedValue({ ...referral, rewardPaid: true }),
      };
      dataSource.transaction.mockImplementation((cb: (m: typeof manager) => Promise<void>) => cb(manager));
      config.get.mockReturnValue(10);

      await service.creditRewardOnFirstTransaction('user-referee');

      expect(wallets.adjustBalance).toHaveBeenCalledWith('user-referrer', 'USD', 10);
      expect(referral.rewardPaid).toBe(true);
      expect(manager.save).toHaveBeenCalledWith(Referral, referral);
    });

    it('returns early without crediting if no unpaid referral found', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      };
      dataSource.transaction.mockImplementation((cb: (m: typeof manager) => Promise<void>) => cb(manager));

      await service.creditRewardOnFirstTransaction('user-referee');

      expect(wallets.adjustBalance).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('prevents double-payment: second concurrent call finds rewardPaid=true and skips', async () => {
      // Simulates: first call already set rewardPaid=true; second call finds null (no unpaid referral)
      const manager = {
        findOne: jest.fn().mockResolvedValue(null), // pessimistic lock returns null because already paid
        save: jest.fn(),
      };
      dataSource.transaction.mockImplementation((cb: (m: typeof manager) => Promise<void>) => cb(manager));

      await service.creditRewardOnFirstTransaction('user-referee');
      await service.creditRewardOnFirstTransaction('user-referee');

      expect(wallets.adjustBalance).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // applyCode
  // ---------------------------------------------------------------------------

  describe('applyCode', () => {
    it('throws NotFoundException when referral code does not exist', async () => {
      config.get.mockImplementation((key: string) => key === 'referral.programActive' ? true : 100);
      referralRepo.findOne.mockResolvedValue(null); // no existing referee record
      referralRepo.find.mockResolvedValue([]); // code not found

      await expect(service.applyCode('INVALID-CODE', 'user-referee')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when program is inactive', async () => {
      config.get.mockImplementation((key: string) => key === 'referral.programActive' ? false : 100);

      await expect(service.applyCode('REF-CODE', 'user-referee')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates referral record when valid code applied', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'referral.programActive') return true;
        if (key === 'referral.maxReferrals') return 100;
        return undefined;
      });
      referralRepo.findOne.mockResolvedValue(null); // no prior referral for this referee
      referralRepo.find.mockResolvedValue([makeReferral()]); // code exists
      referralRepo.count.mockResolvedValue(0); // below limit
      const newReferral = makeReferral({ refereeId: 'new-referee' });
      referralRepo.create.mockReturnValue(newReferral);
      referralRepo.save.mockResolvedValue(newReferral);

      const result = await service.applyCode('REF-ABCD1234-XYZ', 'new-referee');

      expect(referralRepo.save).toHaveBeenCalled();
      expect(result).toEqual(newReferral);
    });
  });
});
