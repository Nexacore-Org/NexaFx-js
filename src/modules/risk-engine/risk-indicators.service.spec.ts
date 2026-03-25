import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskIndicatorsService } from '../risk/services/risk-indicators.service';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { TransactionRiskEntity } from '../../transactions/entities/transaction-risk.entity';

describe('RiskIndicatorsService', () => {
  let service: RiskIndicatorsService;
  let txRepo: Repository<TransactionEntity>;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          dropSchema: true,
          entities: [TransactionEntity, TransactionRiskEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([TransactionEntity, TransactionRiskEntity]),
      ],
      providers: [RiskIndicatorsService],
    }).compile();

    service = moduleRef.get(RiskIndicatorsService);
    txRepo = moduleRef.get(getRepositoryToken(TransactionEntity));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  afterEach(async () => {
    await txRepo.clear();
  });

  const seedTx = async (
    overrides: Partial<TransactionEntity>,
    createdAt: Date = new Date(),
  ) => {
    const tx = txRepo.create({
      amount: 100,
      currency: 'USD',
      status: 'SUCCESS',
      walletId: 'wallet-1',
      toAddress: 'dest-1',
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    });
    return txRepo.save(tx);
  };

  it('flags high velocity when >20 tx in 24h', async () => {
    const walletId = 'wallet-velocity';
    const now = Date.now();
    for (let i = 0; i < 22; i++) {
      await seedTx({ walletId, createdAt: new Date(now - i * 60 * 60 * 1000) });
    }
    const latest = await txRepo.findOne({ where: { walletId } });
    const result = await service.evaluateAllIndicators(latest!);
    const indicator = result.find((r) => r.indicator === 'HIGH_VELOCITY');
    expect(indicator?.triggered).toBe(true);
  });

  it('detects unusual destinations versus baseline', async () => {
    const walletId = 'wallet-dests';
    const now = Date.now();
    // baseline 2 distinct destinations 45-50 days ago
    await seedTx({ walletId, toAddress: 'old-1' }, new Date(now - 45 * 24 * 60 * 60 * 1000));
    await seedTx({ walletId, toAddress: 'old-2' }, new Date(now - 46 * 24 * 60 * 60 * 1000));

    // recent 6 distinct destinations
    for (let i = 0; i < 6; i++) {
      await seedTx({ walletId, toAddress: `new-${i}` }, new Date(now - i * 24 * 60 * 60 * 1000));
    }

    const latest = await txRepo.findOne({ where: { walletId }, order: { createdAt: 'DESC' } });
    const result = await service.evaluateAllIndicators(latest!);
    const indicator = result.find((r) => r.indicator === 'UNUSUAL_DESTINATIONS');
    expect(indicator?.triggered).toBe(true);
  });

  it('detects repeated failures in last 24h', async () => {
    const walletId = 'wallet-failures';
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await seedTx(
        { walletId, status: 'FAILED', toAddress: `f-${i}` },
        new Date(now - i * 2 * 60 * 60 * 1000),
      );
    }

    const latest = await txRepo.findOne({ where: { walletId }, order: { createdAt: 'DESC' } });
    const result = await service.evaluateAllIndicators(latest!);
    const indicator = result.find((r) => r.indicator === 'REPEATED_FAILURES');
    expect(indicator?.triggered).toBe(true);
  });

  it('flags large transaction spike over 3x average', async () => {
    const walletId = 'wallet-spike';
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await seedTx({ walletId, amount: 100 }, new Date(now - (i + 1) * 24 * 60 * 60 * 1000));
    }

    const spike = await seedTx({ walletId, amount: 1000 }, new Date(now));
    const result = await service.evaluateAllIndicators(spike);
    const indicator = result.find((r) => r.indicator === 'LARGE_TRANSACTION_SPIKE');
    expect(indicator?.triggered).toBe(true);
  });

  it('flags new wallet with high early activity', async () => {
    const walletId = 'wallet-new';
    const now = Date.now();
    for (let i = 0; i < 16; i++) {
      await seedTx({ walletId }, new Date(now - i * 3 * 60 * 60 * 1000));
    }
    const latest = await txRepo.findOne({ where: { walletId }, order: { createdAt: 'DESC' } });
    const result = await service.evaluateAllIndicators(latest!);
    const indicator = result.find((r) => r.indicator === 'NEW_WALLET_HIGH_ACTIVITY');
    expect(indicator?.triggered).toBe(true);
  });

  it('detects suspicious round-number patterns', async () => {
    const walletId = 'wallet-pattern';
    const base = Date.now();
    for (let i = 0; i < 8; i++) {
      await seedTx({ walletId, amount: 200, toAddress: `p-${i}` }, new Date(base - i * 5 * 60 * 1000));
    }
    const latest = await txRepo.findOne({ where: { walletId }, order: { createdAt: 'DESC' } });
    const result = await service.evaluateAllIndicators(latest!);
    const indicator = result.find((r) => r.indicator === 'SUSPICIOUS_PATTERNS');
    expect(indicator?.triggered).toBe(true);
  });

  it('persists risk scores when evaluating a transaction', async () => {
    const walletId = 'wallet-persist';
    const tx = await seedTx({ walletId, amount: 500, toAddress: 'persist-dest' });

    const riskRecord = await service.evaluateTransaction(tx.id);

    expect(riskRecord.transactionId).toEqual(tx.id);
    const updated = await txRepo.findOne({ where: { id: tx.id } });
    expect(updated?.riskScore).toBeGreaterThanOrEqual(0);
    expect(updated?.riskEvaluatedAt).toBeDefined();
  });
});
