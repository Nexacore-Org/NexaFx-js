import { FeeRecord } from './fee-record.entity';
import { FeesService, RecordFeeDto } from './fees.service';

const makeDto = (overrides: Partial<RecordFeeDto> = {}): RecordFeeDto => ({
  transactionId: 'tx-1',
  userId: 'user-1',
  transactionType: 'deposit',
  amount: 100,
  feeAmount: 0.1,
  currency: 'USD',
  ...overrides,
});

describe('FeesService', () => {
  let feeRepo: { create: jest.Mock; save: jest.Mock };
  let audit: { recordFeeCalculation: jest.Mock };
  let service: FeesService;

  beforeEach(() => {
    feeRepo = {
      create: jest.fn((input: Record<string, unknown>) => ({
        id: 'fee-1',
        ...input,
      })),
      save: jest.fn((record: FeeRecord) => Promise.resolve(record)),
    };
    audit = {
      recordFeeCalculation: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    service = new FeesService(feeRepo as never, audit as never);
  });

  describe('getFeeRate through calculateFee()', () => {
    it.each([
      ['withdrawal', 1000, 5],
      ['deposit', 1000, 1],
      ['swap', 1000, 1],
      ['default', 1000, 1],
    ])(
      'charges the %s rate on amount %p',
      (transactionType, amount, expected) => {
        expect(service.calculateFee(amount, transactionType).feeAmount).toBe(
          expected,
        );
      },
    );

    it('uses the default rate when called without a transaction type', () => {
      expect(service.calculateFee(250)).toEqual({
        feeAmount: 0.25,
        reason: null,
      });
    });

    it('rounds fees to 8 decimal places without audit side effects', () => {
      expect(service.calculateFee(0.123456789).feeAmount).toBe(0.00012346);
      expect(audit.recordFeeCalculation).not.toHaveBeenCalled();
      expect(feeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('previewFee()', () => {
    it.each([
      ['withdrawal', 200],
      ['deposit', 200],
      ['swap', 33.33],
    ])('agrees with calculateFee for %s', (transactionType, amount) => {
      expect(service.previewFee(transactionType, amount).feeAmount).toBe(
        service.calculateFee(amount, transactionType).feeAmount,
      );
    });

    it('returns fee, net amount and percentage for a withdrawal', () => {
      expect(service.previewFee('withdrawal', 200, 'EUR')).toEqual({
        transactionType: 'withdrawal',
        amount: 200,
        feeAmount: 1,
        netAmount: 199,
        currency: 'EUR',
        feePercentage: 0.5,
      });
    });

    it('defaults the currency to USD', () => {
      expect(service.previewFee('deposit', 100).currency).toBe('USD');
    });
  });

  describe('recordFee()', () => {
    it('marks a zero fee without a reason as no_fee_config', async () => {
      await service.recordFee(makeDto({ feeAmount: 0 }));

      expect(feeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'no_fee_config' }),
      );
    });

    it('keeps an explicit reason on a zero fee', async () => {
      await service.recordFee(
        makeDto({ feeAmount: 0, reason: 'promo_waiver' }),
      );

      expect(feeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'promo_waiver' }),
      );
    });

    it('passes an explicit reason through for a charged fee', async () => {
      await service.recordFee(makeDto({ feeAmount: 0.5, reason: 'tier_2' }));

      expect(feeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'tier_2' }),
      );
    });

    it('leaves the reason null for a charged fee without a reason', async () => {
      await service.recordFee(makeDto({ feeAmount: 0.5 }));

      expect(feeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: null }),
      );
    });

    it('saves the persisted record', async () => {
      const saved = await service.recordFee(makeDto());

      expect(feeRepo.save).toHaveBeenCalledTimes(1);
      expect(saved).toMatchObject({
        id: 'fee-1',
        transactionId: 'tx-1',
        userId: 'user-1',
        currency: 'USD',
      });
    });

    it('audits a charged fee with the real transaction details', async () => {
      await service.recordFee(
        makeDto({ currency: 'NGN', amount: 250, feeAmount: 1.25 }),
      );

      expect(audit.recordFeeCalculation).toHaveBeenCalledWith({
        transactionId: 'tx-1',
        userId: 'user-1',
        feeAmount: 1.25,
        feeCurrency: 'NGN',
        feeType: 'percentage',
        calculatedAmount: 250,
        appliedTier: 'flat',
      });
    });

    it('still returns the saved record when audit writing fails', async () => {
      audit.recordFeeCalculation.mockRejectedValue(new Error('audit down'));
      const logger = jest
        .spyOn(
          (service as unknown as { logger: { error: jest.Mock } }).logger,
          'error',
        )
        .mockImplementation(() => undefined);

      const saved = await service.recordFee(makeDto());
      await new Promise((resolve) => setImmediate(resolve));

      expect(saved).toMatchObject({ id: 'fee-1' });
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('tx-1'));
      logger.mockRestore();
    });
  });

  it.todo(
    'verify withdrawals are charged at 0.5% when transaction flows pass the withdrawal type (https://github.com/Nexacore-Org/NexaFx-js/issues/1067)',
  );
});
