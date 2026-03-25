import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionsModule } from '../src/modules/transactions/transactions.module';
import { RiskEngineModule } from '../src/modules/risk-engine/risk-engine.module';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { TransactionRiskEntity } from '../src/modules/transactions/entities/transaction-risk.entity';
import { TransactionLifecycleService } from '../src/modules/transactions/services/transaction-lifecycle.service';
import { NotificationThrottleEntity } from '../src/modules/notifications/entities/notification-throttle.entity';
import { RiskState } from '../src/modules/risk-engine/entities/risk-state.entity';
import { RiskPosition } from '../src/modules/risk-engine/entities/risk-position.entity';
import { RiskSnapshot } from '../src/modules/risk-engine/entities/risk-snapshot.entity';
import { TransactionExecutionSnapshotEntity } from '../src/modules/transactions/entities/transaction-execution-snapshot.entity';
import { WalletAliasEntity } from '../src/modules/transactions/entities/wallet-alias.entity';
import { TransactionCategoryEntity } from '../src/modules/transactions/entities/transaction-category.entity';

describe('Risk indicators end-to-end', () => {
  let app: INestApplication;
  let txRepo: Repository<TransactionEntity>;
  let riskRepo: Repository<TransactionRiskEntity>;
  let lifecycle: TransactionLifecycleService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          dropSchema: true,
          entities: [
            TransactionEntity,
            TransactionRiskEntity,
            TransactionExecutionSnapshotEntity,
            WalletAliasEntity,
            TransactionCategoryEntity,
            NotificationThrottleEntity,
            RiskState,
            RiskPosition,
            RiskSnapshot,
          ],
          synchronize: true,
        }),
        TransactionsModule,
        RiskEngineModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    txRepo = moduleRef.get(getRepositoryToken(TransactionEntity));
    riskRepo = moduleRef.get(getRepositoryToken(TransactionRiskEntity));
    lifecycle = moduleRef.get(TransactionLifecycleService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('persists risk scores asynchronously on transaction creation', async () => {
    const walletId = 'wallet-e2e';
    const now = Date.now();

    // Seed prior activity to trigger multiple indicators
    for (let i = 0; i < 22; i++) {
      await txRepo.save(
        txRepo.create({
          walletId,
          amount: 100,
          currency: 'USD',
          status: i % 5 === 0 ? 'FAILED' : 'SUCCESS',
          toAddress: `dest-${i}`,
          createdAt: new Date(now - (i + 1) * 60 * 60 * 1000),
          updatedAt: new Date(now - (i + 1) * 60 * 60 * 1000),
        }),
      );
    }

    const created = await lifecycle.create({
      amount: 1200,
      currency: 'USD',
      walletId,
      toAddress: 'dest-new',
    });

    // allow async listener to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    const riskRecord = await riskRepo.findOne({ where: { transactionId: created.id } });
    expect(riskRecord).toBeDefined();
    expect(riskRecord!.riskScore).toBeGreaterThan(0);

    const reloaded = await txRepo.findOne({ where: { id: created.id } });
    expect(reloaded?.riskScore).toEqual(riskRecord!.riskScore);
    expect(reloaded?.requiresManualReview).toEqual(riskRecord!.isFlagged);
  });
});
