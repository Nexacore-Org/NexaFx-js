import { Repository } from 'typeorm';
import { LedgerVerificationService } from './ledger-verification.service';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { WalletBalanceEntity } from '../wallet/wallet-balance.entity';
import { AuditService } from '../audit/audit.service';
import { LedgerVerificationResult } from './ledger-verification-result.entity';

const makeWallet = (accountId: string, currency: string, balance: number): WalletBalanceEntity =>
  ({ id: `w-${accountId}`, accountId, currency, balance } as WalletBalanceEntity);

const makeResult = (overrides: Partial<LedgerVerificationResult> = {}): LedgerVerificationResult =>
  ({ id: 'r-1', totalChecked: 0, discrepancyCount: 0, discrepancies: null, ranAt: new Date(), ...overrides } as LedgerVerificationResult);

describe('LedgerVerificationService', () => {
  let txRepo: jest.Mocked<Pick<Repository<Transaction>, 'createQueryBuilder'>>;
  let walletRepo: jest.Mocked<Pick<Repository<WalletBalanceEntity>, 'find'>>;
  let resultRepo: jest.Mocked<Pick<Repository<LedgerVerificationResult>, 'create' | 'save'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'log'>>;
  let service: LedgerVerificationService;

  const mockQueryBuilder = (total: string) => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total }),
    };
    return qb;
  };

  beforeEach(() => {
    txRepo = { createQueryBuilder: jest.fn() };
    walletRepo = { find: jest.fn() };
    resultRepo = { create: jest.fn(), save: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new LedgerVerificationService(
      txRepo as unknown as Repository<Transaction>,
      walletRepo as unknown as Repository<WalletBalanceEntity>,
      resultRepo as unknown as Repository<LedgerVerificationResult>,
      auditService as unknown as AuditService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('returns balanced=true (discrepancyCount=0) when ledger matches stored balance', async () => {
    walletRepo.find.mockResolvedValue([makeWallet('acc-1', 'USD', 100)]);
    txRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder('100') as any);
    const saved = makeResult({ totalChecked: 1, discrepancyCount: 0 });
    resultRepo.create.mockReturnValue(saved);
    resultRepo.save.mockResolvedValue(saved);

    const result = await service.verify();

    expect(result.discrepancyCount).toBe(0);
    expect(result.discrepancies).toBeNull();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('returns discrepancies when ledger differs from stored balance beyond tolerance', async () => {
    walletRepo.find.mockResolvedValue([makeWallet('acc-1', 'USD', 100)]);
    // ledger says 200, stored is 100 — diff = 100, exceeds TOLERANCE(0.01)
    txRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder('200') as any);
    const saved = makeResult({ totalChecked: 1, discrepancyCount: 1, discrepancies: [{ accountId: 'acc-1' }] });
    resultRepo.create.mockReturnValue(saved);
    resultRepo.save.mockResolvedValue(saved);

    const result = await service.verify();

    expect(result.discrepancyCount).toBe(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ledger.discrepancy' }),
    );
  });

  it('returns zero discrepancies when there are no wallets (zero entries)', async () => {
    walletRepo.find.mockResolvedValue([]);
    const saved = makeResult({ totalChecked: 0, discrepancyCount: 0 });
    resultRepo.create.mockReturnValue(saved);
    resultRepo.save.mockResolvedValue(saved);

    const result = await service.verify();

    expect(result.totalChecked).toBe(0);
    expect(result.discrepancyCount).toBe(0);
    expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('does not flag discrepancy when diff is within TOLERANCE (≤ 0.01)', async () => {
    walletRepo.find.mockResolvedValue([makeWallet('acc-1', 'USD', 100)]);
    // ledger = 100.005, stored = 100 → diff = 0.005 < TOLERANCE
    txRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder('100.005') as any);
    const saved = makeResult({ totalChecked: 1, discrepancyCount: 0 });
    resultRepo.create.mockReturnValue(saved);
    resultRepo.save.mockResolvedValue(saved);

    const result = await service.verify();

    expect(result.discrepancyCount).toBe(0);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('handles null total from query (treats as 0) and flags discrepancy if balance differs', async () => {
    walletRepo.find.mockResolvedValue([makeWallet('acc-1', 'USD', 50)]);
    txRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder('0') as any);
    const saved = makeResult({ totalChecked: 1, discrepancyCount: 1, discrepancies: [{ accountId: 'acc-1' }] });
    resultRepo.create.mockReturnValue(saved);
    resultRepo.save.mockResolvedValue(saved);

    const result = await service.verify();

    expect(result.discrepancyCount).toBe(1);
  });
});
