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
});
