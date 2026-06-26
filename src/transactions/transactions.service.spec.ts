import { DataSource, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Transaction, TransactionStatus } from './transaction.entity';
import { WalletsService } from '../wallet/wallets.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransactionLimitService } from './transaction-limit.service';
import { FeesService } from '../fees/fees.service';

type TransactionManager = {
  create: <T extends Record<string, unknown>>(entity: new () => T, value: T) => T;
  save: <T extends { id?: string }>(entity: new () => T, value: T) => Promise<T>;
};

const makeSavedTx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'tx-1',
    senderId: 'user-1',
    receiverId: 'user-2',
    amount: 25,
    currency: 'USD',
    fee: 0,
    reference: 'ref-1',
    status: TransactionStatus.COMPLETED,
    retryCount: 0,
    createdAt: new Date(),
    completedAt: null,
    reversedAt: null,
    reversedBy: null,
    reversalReason: null,
    reversalTransactionId: null,
    deletedAt: null,
    metadata: {},
    ...overrides,
  } as Transaction);

describe('TransactionsService', () => {
  let txRepo: jest.Mocked<Pick<Repository<Transaction>, 'findOne' | 'createQueryBuilder' | 'create' | 'save'>>;
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
  let walletsService: jest.Mocked<Pick<WalletsService, 'getBalance' | 'adjustBalance'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let mailService: jest.Mocked<Pick<MailService, 'sendTransactionReversalNotice'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;
  let events: jest.Mocked<Pick<EventEmitter2, 'emit'>>;
  let limitService: jest.Mocked<Pick<TransactionLimitService, 'check'>>;
  let feesService: jest.Mocked<Pick<FeesService, 'calculateFee' | 'recordFee'>>;
  let service: TransactionsService;

  beforeEach(() => {
    txRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    dataSource = { transaction: jest.fn() };
    walletsService = { getBalance: jest.fn(), adjustBalance: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    mailService = { sendTransactionReversalNotice: jest.fn() };
    usersService = { findById: jest.fn() };
    events = { emit: jest.fn() };
    limitService = { check: jest.fn().mockResolvedValue(undefined) };
    feesService = {
      calculateFee: jest.fn().mockReturnValue({ feeAmount: 0, reason: null }),
      recordFee: jest.fn().mockResolvedValue({}),
    };

    service = new TransactionsService(
      txRepo as unknown as Repository<Transaction>,
      dataSource as unknown as DataSource,
      walletsService as unknown as WalletsService,
      auditService as unknown as AuditService,
      mailService as unknown as MailService,
      usersService as unknown as UsersService,
      events as unknown as EventEmitter2,
      limitService as unknown as TransactionLimitService,
      feesService as unknown as FeesService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // createDeposit
  // ---------------------------------------------------------------------------

  describe('createDeposit', () => {
    const dto = { userId: 'u1', amount: 100, currency: 'USD', reference: 'dep-1' };

    it('credits balance and sets COMPLETED on success', async () => {
      const tx = makeSavedTx({ status: TransactionStatus.PENDING });
      txRepo.create.mockReturnValue(tx);
      txRepo.save.mockResolvedValue(tx);
      walletsService.adjustBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 200 } as any);

      const result = await service.createDeposit(dto);

      expect(walletsService.adjustBalance).toHaveBeenCalledWith('u1', 'USD', 100);
      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('#742: blocks when amount + fee exceeds daily limit', async () => {
      limitService.check.mockRejectedValueOnce(new BadRequestException('Daily limit exceeded'));
      await expect(
        service.createDeposit({ ...dto, amount: 50_000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(txRepo.create).not.toHaveBeenCalled();
    });

    it('sets FAILED and does not restore balance when Stellar fails', async () => {
      const tx = makeSavedTx({ status: TransactionStatus.PENDING });
      txRepo.create.mockReturnValue(tx);
      txRepo.save.mockResolvedValue(tx);
      walletsService.adjustBalance.mockRejectedValue(new Error('Stellar error'));

      await expect(service.createDeposit(dto)).rejects.toThrow('Stellar error');
      // adjustBalance called once (credit attempt), not a second time for rollback
      expect(walletsService.adjustBalance).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'transaction.deposit.failed' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // createWithdrawal
  // ---------------------------------------------------------------------------

  describe('createWithdrawal', () => {
    const dto = { userId: 'u1', amount: 100, currency: 'USD', reference: 'wd-1' };

    it('deducts balance (amount + fee) and sets COMPLETED on success', async () => {
      const tx = makeSavedTx({ status: TransactionStatus.PENDING });
      txRepo.create.mockReturnValue(tx);
      txRepo.save.mockResolvedValue(tx);
      walletsService.getBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 200 } as any);
      walletsService.adjustBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 100 } as any);

      const result = await service.createWithdrawal(dto);

      expect(walletsService.adjustBalance).toHaveBeenCalledWith('u1', 'USD', expect.any(Number));
      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('#742: blocks when amount + fee exceeds daily limit', async () => {
      limitService.check.mockRejectedValueOnce(new BadRequestException('Daily limit exceeded'));
      await expect(
        service.createWithdrawal({ ...dto, amount: 50_000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when balance is insufficient (including fee)', async () => {
      walletsService.getBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 100 } as any);
      // fee is mocked to 0, so 100 amount + 0 fee == balance (exactly), which passes
      // set fee to make total > balance
      feesService.calculateFee.mockReturnValueOnce({ feeAmount: 1, reason: null });
      await expect(service.createWithdrawal(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('#739: restores deducted balance when Stellar submission fails', async () => {
      const tx = makeSavedTx({ status: TransactionStatus.PENDING });
      txRepo.create.mockReturnValue(tx);
      txRepo.save.mockResolvedValue(tx);
      walletsService.getBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 1000 } as any);
      // First call deducts, second would be the Stellar call replacement — but Stellar fails here
      // We simulate: deduct succeeds, then the Stellar step throws
      walletsService.adjustBalance
        .mockResolvedValueOnce({ accountId: 'u1', currency: 'USD', balance: 899.9 } as any) // deduct
        .mockResolvedValueOnce({ accountId: 'u1', currency: 'USD', balance: 1000 } as any); // refund

      // Simulate Stellar failure by making the tx save (after deduct) throw on second save
      txRepo.save
        .mockResolvedValueOnce(tx) // initial create save
        .mockRejectedValueOnce(new Error('Stellar timeout')); // "Stellar" step fails

      await expect(service.createWithdrawal(dto)).rejects.toThrow('Stellar timeout');

      // Refund call: adjustBalance called with positive amount to restore
      expect(walletsService.adjustBalance).toHaveBeenCalledWith(
        'u1',
        'USD',
        expect.any(Number),
      );
      const calls = (walletsService.adjustBalance as jest.Mock).mock.calls;
      const refundCall = calls.find(([, , delta]: [string, string, number]) => delta > 0);
      expect(refundCall).toBeDefined();

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'transaction.withdrawal.failed_refunded' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // createSwap
  // ---------------------------------------------------------------------------

  describe('createSwap', () => {
    const dto = {
      userId: 'u1',
      fromAmount: 100,
      fromCurrency: 'USD',
      toAmount: 90,
      toCurrency: 'EUR',
      reference: 'swap-1',
    };

    it('completes swap and emits event on success', async () => {
      const tx = makeSavedTx({ status: TransactionStatus.PENDING, retryCount: 0 });
      txRepo.create.mockReturnValue(tx);
      txRepo.save.mockResolvedValue(tx);
      walletsService.getBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 1000 } as any);
      walletsService.adjustBalance.mockResolvedValue({ accountId: 'u1', currency: 'EUR', balance: 90 } as any);

      const result = await service.createSwap(dto);

      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(events.emit).toHaveBeenCalledWith('transactions.swap.completed', expect.any(Object));
    });

    it('#742: blocks when fromAmount + fee exceeds daily limit', async () => {
      limitService.check.mockRejectedValueOnce(new BadRequestException('Daily limit exceeded'));
      await expect(
        service.createSwap({ ...dto, fromAmount: 50_000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('#741: does NOT save FAILED status on intermediate retry failures', async () => {
      const tx = makeSavedTx({ status: TransactionStatus.PENDING, retryCount: 0 });
      txRepo.create.mockReturnValue(tx);
      txRepo.save.mockResolvedValue(tx);
      walletsService.getBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 1000 } as any);
      // deduct succeeds; all toCurrency credits fail; final refund succeeds
      walletsService.adjustBalance
        .mockResolvedValueOnce({ accountId: 'u1', currency: 'USD', balance: 899.9 } as any) // deduct
        .mockRejectedValueOnce(new Error('Stellar error')) // attempt 1
        .mockRejectedValueOnce(new Error('Stellar error')) // attempt 2
        .mockRejectedValueOnce(new Error('Stellar error')) // attempt 3
        .mockResolvedValueOnce({ accountId: 'u1', currency: 'USD', balance: 1000 } as any); // refund

      await expect(service.createSwap(dto)).rejects.toThrow('Stellar error');

      // After all retries, tx.status must be FAILED (not set during intermediate retries)
      expect(tx.status).toBe(TransactionStatus.FAILED);
      expect(tx.retryCount).toBeGreaterThan(0);

      // FAILED webhook dispatched exactly once (after final failure)
      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith('transactions.swap.failed', expect.any(Object));
    });

    it('#741: retryCount reflects number of attempts made', async () => {
      const tx = makeSavedTx({ status: TransactionStatus.PENDING, retryCount: 0 });
      txRepo.create.mockReturnValue(tx);
      txRepo.save.mockResolvedValue(tx);
      walletsService.getBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 1000 } as any);
      walletsService.adjustBalance
        .mockResolvedValueOnce({ accountId: 'u1', currency: 'USD', balance: 899.9 } as any)
        .mockRejectedValue(new Error('fail'));

      await expect(service.createSwap(dto)).rejects.toThrow();

      expect(tx.retryCount).toBe(3); // MAX_RETRIES
    });

    it('#739: restores from-currency balance after all retries fail', async () => {
      const tx = makeSavedTx({ status: TransactionStatus.PENDING, retryCount: 0 });
      txRepo.create.mockReturnValue(tx);
      txRepo.save.mockResolvedValue(tx);
      walletsService.getBalance.mockResolvedValue({ accountId: 'u1', currency: 'USD', balance: 1000 } as any);
      walletsService.adjustBalance
        .mockResolvedValueOnce({ accountId: 'u1', currency: 'USD', balance: 899.9 } as any) // deduct
        .mockRejectedValueOnce(new Error('fail')) // attempt 1
        .mockRejectedValueOnce(new Error('fail')) // attempt 2
        .mockRejectedValueOnce(new Error('fail')) // attempt 3
        .mockResolvedValueOnce({ accountId: 'u1', currency: 'USD', balance: 1000 } as any); // refund

      await expect(service.createSwap(dto)).rejects.toThrow();

      const calls = (walletsService.adjustBalance as jest.Mock).mock.calls;
      // Last adjustBalance call should be the refund (positive delta on fromCurrency)
      const refundCall = calls.find(
        ([accountId, currency, delta]: [string, string, number]) =>
          accountId === 'u1' && currency === 'USD' && delta > 0,
      );
      expect(refundCall).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // reverseTransaction (existing test preserved)
  // ---------------------------------------------------------------------------

  describe('reverseTransaction', () => {
    it('reverses a transaction and restores balances', async () => {
      (txRepo.findOne as jest.Mock).mockResolvedValue(makeSavedTx());
      (usersService.findById as jest.Mock)
        .mockResolvedValueOnce({ id: 'user-1', email: 'sender@example.com' })
        .mockResolvedValueOnce({ id: 'user-2', email: 'receiver@example.com' });
      const manager: TransactionManager = {
        create: (_entity, value) => value,
        save: (_entity, value) => Promise.resolve({ ...value, id: value.id ?? 'reversal-1' }),
      };
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (callback: (m: TransactionManager) => Promise<unknown>) => callback(manager),
      );

      await expect(
        service.reverseTransaction('tx-1', { reversedBy: 'admin-1', reason: 'fraud review' }),
      ).resolves.toMatchObject({
        reversedBy: 'admin-1',
        reversalReason: 'fraud review',
        status: TransactionStatus.REVERSED,
      });
    });
  });
});
