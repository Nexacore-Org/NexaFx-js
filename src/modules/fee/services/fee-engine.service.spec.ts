jest.mock('../dto/simulate-fee.dto', () => ({}), { virtual: true });
jest.mock(
  '../../fee-tiers/fee-tiers.service',
  () => ({ FeeTiersService: class {} }),
  {
    virtual: true,
  },
);
jest.mock('../../fee-tiers/entities/fee-tier.entity', () => ({}), {
  virtual: true,
});

import Big from 'big.js';
import { FeeRuleEntity } from '../entities/fee-rule.entity';
import { FeeEngineService } from './fee-engine.service';

type TestRule = FeeRuleEntity & {
  ruleType: string;
  promoCode?: string;
  percentage: number | string;
  flatFee: number | string;
  priority: number;
  expiresAt?: Date | null;
  minAmount?: number | null;
  maxAmount?: number | null;
};

const makeRule = (overrides: Partial<TestRule> = {}): FeeRuleEntity =>
  ({
    id: 'rule-1',
    name: 'Standard fee',
    currency: 'USD',
    isActive: true,
    ruleType: 'STANDARD',
    percentage: 0,
    flatFee: 0,
    priority: 100,
    expiresAt: null,
    minAmount: null,
    maxAmount: null,
    ...overrides,
  }) as unknown as FeeRuleEntity;

const makeQueryBuilder = (rules: FeeRuleEntity[]) => {
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(rules);
  return qb;
};

describe('FeeEngineService', () => {
  let qb: ReturnType<typeof makeQueryBuilder>;
  let ruleRepo: { createQueryBuilder: jest.Mock };
  let feeTiersService: { calculateFee: jest.Mock };
  let service: FeeEngineService;

  beforeEach(() => {
    qb = makeQueryBuilder([]);
    ruleRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    feeTiersService = {
      calculateFee: jest
        .fn()
        .mockResolvedValue({ tier: null, feeAmount: 0, totalAmount: 0 }),
    };
    service = new FeeEngineService(ruleRepo as never, feeTiersService);
  });

  describe('evaluate() rule selection', () => {
    it('prefers a KYC tier over a matching promotional rule', async () => {
      feeTiersService.calculateFee.mockResolvedValue({
        tier: { id: 'tier-1' },
        feeAmount: 0.75,
        totalAmount: 100.75,
      });
      qb.getMany.mockResolvedValue([
        makeRule({
          id: 'promo-1',
          ruleType: 'PROMOTIONAL',
          promoCode: 'SAVE',
          percentage: 1,
        }),
      ]);

      const result = await service.evaluate(100, 'USD', 'SAVE', 'advanced');

      expect(feeTiersService.calculateFee).toHaveBeenCalledWith(
        'advanced',
        'USD',
        100,
      );
      expect(ruleRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        ruleId: 'tier-1',
        ruleType: 'KYC_TIER',
        feeAmount: 0.75,
        currency: 'USD',
      });
      expect(result?.appliedAt).toBeInstanceOf(Date);
    });

    it('falls back to rules when no KYC tier matches', async () => {
      qb.getMany.mockResolvedValue([makeRule({ id: 'rule-9', flatFee: 2 })]);

      const result = await service.evaluate(100, 'USD', undefined, 'basic');

      expect(result).toMatchObject({ ruleId: 'rule-9', feeAmount: 2 });
    });

    it('selects a matching PROMOTIONAL rule regardless of priority', async () => {
      qb.getMany.mockResolvedValue([
        makeRule({ id: 'standard-1', priority: 1, flatFee: 5 }),
        makeRule({
          id: 'promo-1',
          ruleType: 'PROMOTIONAL',
          promoCode: 'SAVE',
          priority: 90,
          flatFee: 1,
        }),
      ]);

      const result = await service.evaluate(100, 'USD', 'SAVE');

      expect(result).toMatchObject({
        ruleId: 'promo-1',
        ruleType: 'PROMOTIONAL',
        feeAmount: 1,
      });
    });

    it.each([
      [undefined, 'rule-low'],
      ['NOPE', 'rule-low'],
    ])(
      'uses the lowest-priority rule when promo code is %p',
      async (promoCode, expectedId) => {
        qb.getMany.mockResolvedValue([
          makeRule({ id: 'rule-low', priority: 1, flatFee: 1 }),
          makeRule({ id: 'rule-high', priority: 10, flatFee: 9 }),
        ]);

        const result = await service.evaluate(100, 'USD', promoCode);

        expect(result?.ruleId).toBe(expectedId);
        expect(qb.orderBy).toHaveBeenCalledWith('r.priority', 'ASC');
      },
    );

    it('queries only active, unexpired rules for the currency and amount', async () => {
      await service.evaluate(150, 'EUR');

      expect(qb.where).toHaveBeenCalledWith('r.isActive = true');
      expect(qb.andWhere).toHaveBeenCalledWith('r.currency = :currency', {
        currency: 'EUR',
      });
      const expiryCall = qb.andWhere.mock.calls.find(([sql]) =>
        String(sql).includes('expiresAt'),
      ) as [string, { now: Date }] | undefined;
      expect(expiryCall?.[0]).toBe(
        '(r.expiresAt IS NULL OR r.expiresAt > :now)',
      );
      expect(expiryCall?.[1].now).toBeInstanceOf(Date);
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(r.minAmount IS NULL OR r.minAmount <= :amount)',
        { amount: 150 },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(r.maxAmount IS NULL OR r.maxAmount >= :amount)',
        { amount: 150 },
      );
    });

    it('returns null when no rule is applicable', async () => {
      expect(await service.evaluate(100, 'USD')).toBeNull();
    });
  });

  describe('evaluate() fee rounding', () => {
    const roundingCases: Array<{
      amount: number;
      percentage: string;
      flatFee: number;
      expected: number;
    }> = [
      { amount: 100, percentage: '0.00000001', flatFee: 0, expected: 1e-8 },
      {
        amount: 123.456789123,
        percentage: '0.12345678',
        flatFee: 0,
        expected: 0.15241578,
      },
      {
        amount: 12345.6789,
        percentage: '0.000001',
        flatFee: 1e-8,
        expected: 0.00012347,
      },
      { amount: 1e-8, percentage: '1000000', flatFee: 0, expected: 0.0001 },
      {
        amount: 999.99999999,
        percentage: '0.0000005',
        flatFee: 0,
        expected: 0.000005,
      },
      {
        amount: 1,
        percentage: '33.333333333',
        flatFee: 0,
        expected: 0.33333333,
      },
      {
        amount: 1234.56789,
        percentage: '0.12345678',
        flatFee: 0.999999995,
        expected: 2.52415776,
      },
      {
        amount: 77.7,
        percentage: '1.23456789',
        flatFee: 5e-9,
        expected: 0.95925926,
      },
    ];

    it.each(roundingCases)(
      'rounds $amount at $percentage% + $flatFee to $expected at 8dp',
      async ({ amount, percentage, flatFee, expected }) => {
        qb.getMany.mockResolvedValue([makeRule({ percentage, flatFee })]);

        const result = await service.evaluate(amount, 'USD');

        expect(result?.feeAmount).toBe(expected);
        expect(
          new Big(expected).eq(
            new Big(amount).times(percentage).div(100).plus(flatFee).round(8),
          ),
        ).toBe(true);
      },
    );
  });

  describe('simulate()', () => {
    it('adds the selected fee to the simulated total', async () => {
      qb.getMany.mockResolvedValue([makeRule({ flatFee: 2.5 })]);

      const result = await service.simulate({ amount: 100, currency: 'USD' });

      expect(result.success).toBe(true);
      expect(result.appliedFee).toMatchObject({
        feeAmount: 2.5,
        ruleId: 'rule-1',
      });
      expect(result.totalAmount).toBe(102.5);
    });

    it('reports no matching rule with a zero fee', async () => {
      const result = await service.simulate({ amount: 100, currency: 'USD' });

      expect(result.appliedFee).toMatchObject({
        feeAmount: 0,
        ruleType: 'NONE',
      });
      expect(result.totalAmount).toBe(100);
    });
  });

  it.todo(
    'pin the fee-engine behaviour once the missing SimulateFeeDto, FeeTiers dependency and rule columns are restored (https://github.com/Nexacore-Org/NexaFx-js/issues/1629)',
  );
});
