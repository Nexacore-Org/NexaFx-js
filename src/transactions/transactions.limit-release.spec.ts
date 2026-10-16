import { BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

const RESERVED_USD = 123.45;

function build() {
  const txRepo = {
    create: jest.fn((v) => ({ id: 'tx-1', ...v })),
    save: jest.fn(async (v) => v),
  };
  const wallets = {
    getBalance: jest.fn().mockResolvedValue({ balance: 1_000_000 }),
    adjustBalance: jest.fn().mockResolvedValue(undefined),
  };
  const limits = {
    check: jest.fn().mockResolvedValue(RESERVED_USD),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TransactionsService(
    txRepo as any,
    { options: { type: 'better-sqlite3' }, query: jest.fn() } as any,
    wallets as any,
    { accountExists: jest.fn().mockResolvedValue(true) } as any,
    { get: jest.fn() } as any,
    { log: jest.fn() } as any,
    {} as any,
    { invalidateWalletBalanceCache: jest.fn() } as any,
    { emit: jest.fn() } as any,
    limits as any,
    { calculateFee: jest.fn().mockReturnValue({ feeAmount: 1, reason: 'flat' }), recordFee: jest.fn() } as any,
    { isUserDeactivated: jest.fn().mockResolvedValue(false) } as any,
    { ensureAccepted: jest.fn() } as any,
  );
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  return { service, txRepo, wallets, limits };
}

const deposit = { userId: 'u1', amount: 100, currency: 'USD', reference: 'r1', metadata: {} } as any;
const withdrawal = { ...deposit, destinationAddress: 'GDEST' } as any;
const swap = { userId: 'u1', fromAmount: 100, fromCurrency: 'USD', toCurrency: 'NGN', reference: 'r1', metadata: {} } as any;

describe('limit release on failure (#1376)', () => {
  describe('deposit', () => {
    it('releases the reservation when the deposit fails', async () => {
      const { service, wallets, limits } = build();
      wallets.adjustBalance.mockRejectedValue(new Error('credit failed'));
      await expect(service.createDeposit(deposit)).rejects.toThrow('credit failed');
      expect(limits.release).toHaveBeenCalledWith('u1', RESERVED_USD);
    });

    it('keeps the reservation when the deposit succeeds', async () => {
      const { service, limits } = build();
      await service.createDeposit(deposit);
      expect(limits.release).not.toHaveBeenCalled();
    });
  });

  describe('withdrawal', () => {
    it('releases when the withdrawal is refunded', async () => {
      const { service, txRepo, limits } = build();
      // PENDING saves succeed; the COMPLETED save fails, driving the refund branch.
      txRepo.save
        .mockImplementationOnce(async (v) => v) // PENDING
        .mockImplementationOnce(async (v) => v) // receipt number
        .mockRejectedValueOnce(new Error('stellar submission failed'));
      await expect(service.createWithdrawal(withdrawal)).rejects.toThrow('stellar submission failed');
      expect(limits.release).toHaveBeenCalledWith('u1', RESERVED_USD);
    });

    it('releases when it is rejected for insufficient balance after the limit check', async () => {
      const { service, wallets, limits } = build();
      wallets.getBalance.mockResolvedValue({ balance: 1 });
      await expect(service.createWithdrawal(withdrawal)).rejects.toBeInstanceOf(BadRequestException);
      expect(limits.release).toHaveBeenCalledWith('u1', RESERVED_USD);
    });

    it('keeps the reservation when the withdrawal succeeds', async () => {
      const { service, limits } = build();
      await service.createWithdrawal(withdrawal);
      expect(limits.release).not.toHaveBeenCalled();
    });
  });

  describe('swap', () => {
    it('releases when every retry is exhausted and the swap is refunded', async () => {
      const { service, wallets, limits } = build();
      wallets.adjustBalance.mockImplementation(async (_u: string, currency: string, amount: number) => {
        if (currency === 'NGN' && amount > 0) throw new Error('credit leg failed');
      });
      await expect(service.createSwap(swap)).rejects.toThrow('credit leg failed');
      expect(limits.release).toHaveBeenCalledWith('u1', RESERVED_USD);
    });

    it('keeps the reservation when the swap succeeds', async () => {
      const { service, limits } = build();
      await service.createSwap(swap);
      expect(limits.release).not.toHaveBeenCalled();
    });
  });

  it('a failure to release never masks the original error', async () => {
    const { service, wallets, limits } = build();
    wallets.adjustBalance.mockRejectedValue(new Error('credit failed'));
    limits.release.mockRejectedValue(new Error('limit store down'));
    await expect(service.createDeposit(deposit)).rejects.toThrow('credit failed');
  });
});
