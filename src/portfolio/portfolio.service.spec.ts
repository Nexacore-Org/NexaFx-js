import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PortfolioService } from './portfolio.service';
import { PortfolioSnapshot } from './entities/portfolio-snapshot.entity';
import { WalletsService } from '../wallet/wallets.service';
import { ExchangeRateService } from '../fx/exchange-rate.service';

/**
 * #1585: PortfolioService.computeRebalancing / validateTargetAllocations had no
 * tests. Covers the allocation sum tolerance, per-currency bounds, unsupported
 * currencies, the buy/sell/hold thresholds and USD valuation.
 */
describe('PortfolioService (#1585)', () => {
  let service: PortfolioService;
  let walletsService: { getBalancesForAccount: jest.Mock };
  let exchangeRateService: { getRate: jest.Mock };
  let snapshotRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    walletsService = { getBalancesForAccount: jest.fn() };
    exchangeRateService = {
      getRate: jest.fn().mockResolvedValue({ rate: 1 }),
    };
    snapshotRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'snap-1', ...value })),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        { provide: getRepositoryToken(PortfolioSnapshot), useValue: snapshotRepo },
        { provide: WalletsService, useValue: walletsService },
        { provide: ExchangeRateService, useValue: exchangeRateService },
      ],
    }).compile();

    service = module.get(PortfolioService);
  });

  describe('validateTargetAllocations', () => {
    it('rejects an empty allocation map', async () => {
      await expect(
        service.computeRebalancing({ userId: 'user-1', targetAllocations: {} }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects allocations that do not sum to 1', async () => {
      await expect(
        service.computeRebalancing({
          userId: 'user-1',
          targetAllocations: { USD: 0.5, EUR: 0.4 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a sum within the 1e-6 tolerance', async () => {
      walletsService.getBalancesForAccount.mockResolvedValue([]);

      await expect(
        service.computeRebalancing({
          userId: 'user-1',
          targetAllocations: { USD: 0.5, EUR: 0.5 + 1e-9 },
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a percentage outside 0..1', async () => {
      await expect(
        service.computeRebalancing({
          userId: 'user-1',
          targetAllocations: { USD: 1.5 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unsupported currency', async () => {
      await expect(
        service.computeRebalancing({
          userId: 'user-1',
          targetAllocations: { XYZ: 1 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('computeRebalancing', () => {
    it('values holdings in USD and emits buy/sell/hold suggestions', async () => {
      walletsService.getBalancesForAccount.mockResolvedValue([
        { currency: 'USD', balance: 60 },
        { currency: 'EUR', balance: 100 },
      ]);
      exchangeRateService.getRate.mockResolvedValue({ rate: 0.1 });

      const suggestions = await service.computeRebalancing({
        userId: 'user-1',
        targetAllocations: { USD: 0.5, EUR: 0.5 },
      });

      // Total portfolio = 60 + 100 * 0.1 = 70 USD; each target is 35 USD.
      const usd = suggestions.find((s) => s.currency === 'USD');
      const eur = suggestions.find((s) => s.currency === 'EUR');

      expect(usd).toMatchObject({ action: 'sell', currentAmountUsd: 60 });
      expect(usd?.targetAmountUsd).toBeCloseTo(35, 8);
      expect(usd?.differenceUsd).toBeCloseTo(-25, 8);

      expect(eur).toMatchObject({ action: 'buy', currentAmountUsd: 10 });
      expect(eur?.targetAmount).toBeCloseTo(350, 8);
    });

    it('holds a position whose USD difference is within the 0.01 threshold', async () => {
      walletsService.getBalancesForAccount.mockResolvedValue([
        { currency: 'USD', balance: 1 },
      ]);

      const suggestions = await service.computeRebalancing({
        userId: 'user-1',
        targetAllocations: { USD: 1 },
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toMatchObject({ currency: 'USD', action: 'hold' });
    });

    it('does not persist a snapshot (rebalancing is read-only)', async () => {
      walletsService.getBalancesForAccount.mockResolvedValue([
        { currency: 'USD', balance: 10 },
      ]);

      await service.computeRebalancing({
        userId: 'user-1',
        targetAllocations: { USD: 1 },
      });

      expect(snapshotRepo.save).not.toHaveBeenCalled();
    });
  });
});
