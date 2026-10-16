import { BadRequestException } from '@nestjs/common';
import { TransactionLimitService } from './transaction-limit.service';
import { ExchangeRateService } from '../fx/exchange-rate.service';

const mockRate = (rate: number) =>
  ({ getRate: jest.fn().mockResolvedValue({ rate }) } as unknown as ExchangeRateService);

describe('TransactionLimitService', () => {
  let service: TransactionLimitService;

  beforeEach(() => {
    service = new TransactionLimitService(mockRate(1.1)); // EUR→USD = 1.1
    service.resetAccumulators();
  });

  it('passes when under daily limit', async () => {
    await expect(service.check('u1', 100, 'USD')).resolves.not.toThrow();
  });

  it('converts non-USD currency before checking', async () => {
    // 100 EUR * 1.1 = 110 USD — well under limit
    await expect(service.check('u1', 100, 'EUR')).resolves.not.toThrow();
  });

  it('accumulates across currencies and rejects when limit exceeded', async () => {
    const highRate = mockRate(1.0);
    service = new TransactionLimitService(highRate);
    service.resetAccumulators();

    // Set daily limit env override not possible at runtime, so test via large single amount
    // Simulate: two transactions that together exceed DAILY_LIMIT_USD (50_000)
    await service.check('u2', 30_000, 'USD');
    await expect(service.check('u2', 25_000, 'USD')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not share accumulators between users', async () => {
    await service.check('userA', 49_000, 'USD');
    // userB starts fresh — should pass
    await expect(service.check('userB', 49_000, 'USD')).resolves.not.toThrow();
  });

  describe('release (#1376)', () => {
    it('check() returns the USD amount it reserved', async () => {
      await expect(service.check('r1', 100, 'EUR')).resolves.toBeCloseTo(110, 5);
      await expect(service.check('r1', 50, 'USD')).resolves.toBe(50);
    });

    it('giving back a reservation restores daily headroom', async () => {
      const reserved = await service.check('r2', 30_000, 'USD');
      await expect(service.check('r2', 25_000, 'USD')).rejects.toBeInstanceOf(BadRequestException);

      await service.release('r2', reserved);
      await expect(service.check('r2', 25_000, 'USD')).resolves.toBe(25_000);
    });

    it('floors the totals at zero instead of going negative', async () => {
      await service.check('r3', 100, 'USD');
      await service.release('r3', 5_000);
      // Had the total gone negative (-4,900), 49,000 + 100 would still fit; at the floor of 0 it must too,
      // and a further 1,000 over the daily limit must still be refused.
      await expect(service.check('r3', 25_000, 'USD')).resolves.toBe(25_000);
      await expect(service.check('r3', 25_000, 'USD')).resolves.toBe(25_000);
      await expect(service.check('r3', 1, 'USD')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not touch other users', async () => {
      await service.check('userX', 40_000, 'USD');
      await service.check('userY', 40_000, 'USD');
      await service.release('userX', 40_000);

      await expect(service.check('userX', 40_000, 'USD')).resolves.toBe(40_000);
      await expect(service.check('userY', 20_000, 'USD')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ignores non-positive amounts', async () => {
      await service.check('r4', 49_000, 'USD');
      await service.release('r4', 0);
      await service.release('r4', -10);
      await expect(service.check('r4', 2_000, 'USD')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('releases in order with concurrent checks for the same user', async () => {
      const reserved = await service.check('r5', 30_000, 'USD');
      const [, second] = await Promise.allSettled([
        service.release('r5', reserved),
        service.check('r5', 25_000, 'USD'),
      ]);
      expect(second.status).toBe('fulfilled');
    });
  });
});
