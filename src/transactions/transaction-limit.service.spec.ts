import { BadRequestException } from '@nestjs/common';
import { TransactionLimitService } from './transaction-limit.service';
import { ExchangeRateService } from '../fx/exchange-rate.service';

/**
 * #1442: these tests previously used single transactions larger than
 * `SINGLE_TX_LIMIT_USD` (25,000), so they exercised the single-transaction
 * guard rather than the daily accumulator and failed. They now accumulate
 * several sub-single-limit transactions to cross each limit, and cover the
 * single-transaction and monthly limits explicitly.
 *
 * Defaults under test: daily 50,000 USD, monthly 500,000 USD, single 25,000 USD.
 */
const SINGLE_TX_LIMIT = 25_000;

const mockRate = (rate: number) =>
  ({
    getRate: jest.fn().mockResolvedValue({ rate }),
  }) as unknown as ExchangeRateService;

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

  it('returns the USD value it reserved', async () => {
    await expect(service.check('conv', 100, 'EUR')).resolves.toBeCloseTo(
      110,
      5,
    );
  });

  // ── Single-transaction limit ───────────────────────────────────────────────

  it('accepts a transaction at exactly the single-transaction limit', async () => {
    await expect(service.check('single', SINGLE_TX_LIMIT, 'USD')).resolves.toBe(
      SINGLE_TX_LIMIT,
    );
  });

  it('rejects a single transaction above the single-transaction limit', async () => {
    await expect(
      service.check('single', SINGLE_TX_LIMIT + 1, 'USD'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Daily accumulator ──────────────────────────────────────────────────────

  it('accumulates across currencies and rejects when the daily limit is exceeded', async () => {
    const highRate = mockRate(1.0);
    service = new TransactionLimitService(highRate);
    service.resetAccumulators();

    // Each transaction is under the single-transaction limit, but together they
    // cross the 50,000 daily limit.
    await service.check('u2', 20_000, 'USD');
    await service.check('u2', 20_000, 'USD');
    await expect(service.check('u2', 20_000, 'USD')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accumulates a EUR transaction into the daily USD total', async () => {
    // 20,000 EUR * 1.1 = 22,000 USD reserved; another 20,000 EUR (22,000) would
    // push the daily total to 44,000, and a third to 66,000 → rejected.
    await service.check('eur', 20_000, 'EUR');
    await service.check('eur', 20_000, 'EUR');
    await expect(service.check('eur', 20_000, 'EUR')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not share accumulators between users', async () => {
    await service.check('userA', 20_000, 'USD');
    // userB starts fresh — should pass even though A has spent against the day.
    await expect(service.check('userB', 20_000, 'USD')).resolves.toBe(20_000);
  });

  // ── Rejected checks must not commit ────────────────────────────────────────

  it('does not commit to the accumulators when a check is rejected', async () => {
    await service.check('reject', 20_000, 'USD');
    // This 20,000 would bring the total to 40,000 (still fine)...
    await service.check('reject', 20_000, 'USD');
    // ...this one would exceed the daily limit and must be rejected...
    await expect(service.check('reject', 20_000, 'USD')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // A rejected check must not have consumed headroom: 10,000 more still fits
    // under the 50,000 daily limit (40,000 + 10,000).
    await expect(service.check('reject', 10_000, 'USD')).resolves.toBe(10_000);
    // And now the limit is genuinely exhausted.
    await expect(service.check('reject', 1, 'USD')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ── Monthly limit ──────────────────────────────────────────────────────────

  it('enforces the monthly limit independently of the daily limit', async () => {
    jest.useFakeTimers();
    try {
      // Spend the full daily allowance (50,000, as two 25,000 transactions) on
      // each of 10 days for one user: monthly total reaches 500,000.
      for (let day = 0; day < 10; day++) {
        jest.setSystemTime(new Date(Date.UTC(2026, 0, 1 + day, 12)));
        await service.check('monthly', 25_000, 'USD');
        await service.check('monthly', 25_000, 'USD');
      }
      expect(jest.getTimerCount()).toBe(0);

      // Day 11 would exceed the 500,000 monthly limit even though the daily
      // total for that fresh day is only 25,000.
      jest.setSystemTime(new Date(Date.UTC(2026, 0, 11, 12)));
      await expect(
        service.check('monthly', 25_000, 'USD'),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      jest.useRealTimers();
    }
  });

  describe('release (#1376)', () => {
    it('check() returns the USD amount it reserved', async () => {
      await expect(service.check('r1', 100, 'EUR')).resolves.toBeCloseTo(
        110,
        5,
      );
      await expect(service.check('r1', 50, 'USD')).resolves.toBe(50);
    });

    it('giving back a reservation restores daily headroom', async () => {
      const reserved = await service.check('r2', 25_000, 'USD');
      const second = await service.check('r2', 25_000, 'USD');
      // Daily total is now 50,000 — one more dollar is refused.
      await expect(service.check('r2', 1, 'USD')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      await service.release('r2', reserved);
      await service.release('r2', second);
      await expect(service.check('r2', 25_000, 'USD')).resolves.toBe(25_000);
    });

    it('floors the totals at zero instead of going negative', async () => {
      await service.check('r3', 100, 'USD');
      await service.release('r3', 5_000);
      // Had the total gone negative (-4,900), further checks would still fit; at
      // the floor of 0 the daily limit must still be enforced from 0.
      await expect(service.check('r3', 25_000, 'USD')).resolves.toBe(25_000);
      await expect(service.check('r3', 25_000, 'USD')).resolves.toBe(25_000);
      await expect(service.check('r3', 1, 'USD')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('does not touch other users', async () => {
      await service.check('userX', 20_000, 'USD');
      await service.check('userY', 20_000, 'USD');
      await service.release('userX', 20_000);

      await expect(service.check('userX', 20_000, 'USD')).resolves.toBe(20_000);
      // userY still has 20,000 used, so another 20,000 is fine, but 35,000 is not.
      await expect(
        service.check('userY', 35_000, 'USD'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ignores non-positive amounts', async () => {
      await service.check('r4', 20_000, 'USD');
      await service.release('r4', 0);
      await service.release('r4', -10);
      // 20,000 used + 20,000 more = 40,000 (ok); a further 20,000 is refused.
      await service.check('r4', 20_000, 'USD');
      await expect(service.check('r4', 20_000, 'USD')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('releases in order with concurrent checks for the same user', async () => {
      const reserved = await service.check('r5', 20_000, 'USD');
      const [, second] = await Promise.allSettled([
        service.release('r5', reserved),
        service.check('r5', 25_000, 'USD'),
      ]);
      expect(second.status).toBe('fulfilled');
    });
  });
});
