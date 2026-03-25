import { randomUUID } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';
import { NotificationService } from '../src/modules/notifications/services/notification.service';
import { DisputeEntity } from '../src/modules/disputes/entities/dispute.entity';
import { EscrowController } from '../src/modules/escrow/controllers/escrow.controller';
import { EscrowEntity } from '../src/modules/escrow/entities/escrow.entity';
import { AutoReleaseJob } from '../src/modules/escrow/jobs/auto-release.job';
import { EscrowService } from '../src/modules/escrow/services/escrow.service';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { WalletEntity } from '../src/modules/users/entities/wallet.entity';

class InMemoryRepository<T extends { id?: string }> {
  private readonly items = new Map<string, T>();

  create(partial: Partial<T>): T {
    return { ...partial } as T;
  }

  async save(entity: T): Promise<T>;
  async save(entities: T[]): Promise<T[]>;
  async save(entityOrEntities: T | T[]): Promise<T | T[]> {
    if (Array.isArray(entityOrEntities)) {
      return Promise.all(entityOrEntities.map((entity) => this.saveOne(entity)));
    }

    return this.saveOne(entityOrEntities);
  }

  async findOne(options: { where?: any }): Promise<T | null> {
    return this.findMatching(options.where);
  }

  async findOneBy(where: any): Promise<T | null> {
    return this.findMatching(where);
  }

  async findOneByOrFail(where: any): Promise<T> {
    const item = await this.findMatching(where);
    if (!item) {
      throw new Error('Entity not found');
    }

    return item;
  }

  async find(options?: { where?: any }): Promise<T[]> {
    const allItems = Array.from(this.items.values()).map((item) => this.clone(item));
    if (!options?.where) {
      return allItems;
    }

    return allItems.filter((item) => this.matches(item, options.where));
  }

  async clear(): Promise<void> {
    this.items.clear();
  }

  private async saveOne(entity: T): Promise<T> {
    const record = this.clone(entity);
    if (!record.id) {
      record.id = randomUUID();
    }

    this.items.set(record.id, this.clone(record));
    return this.clone(record);
  }

  private async findMatching(where: any): Promise<T | null> {
    if (!where) {
      return null;
    }

    for (const item of this.items.values()) {
      if (this.matches(item, where)) {
        return this.clone(item);
      }
    }

    return null;
  }

  private matches(item: T, where: any): boolean {
    if (Array.isArray(where)) {
      return where.some((candidate) => this.matches(item, candidate));
    }

    return Object.entries(where).every(([key, value]) => {
      const itemValue = (item as Record<string, any>)[key];
      if (value instanceof Date && itemValue instanceof Date) {
        return itemValue.getTime() === value.getTime();
      }

      return itemValue === value;
    });
  }

  private clone(item: T): T {
    return structuredClone(item);
  }
}

class FakeEntityManager {
  constructor(private readonly repositories: Map<Function, InMemoryRepository<any>>) {}

  getRepository<Entity extends { id?: string }>(entity: Function): InMemoryRepository<Entity> {
    const repository = this.repositories.get(entity);
    if (!repository) {
      throw new Error(`Repository not registered for ${entity.name}`);
    }

    return repository;
  }
}

class FakeDataSource {
  private readonly manager: FakeEntityManager;

  constructor(repositories: Map<Function, InMemoryRepository<any>>) {
    this.manager = new FakeEntityManager(repositories);
  }

  async transaction<T>(work: (manager: FakeEntityManager) => Promise<T>): Promise<T> {
    return work(this.manager);
  }
}

describe('Escrow E2E', () => {
  let moduleFixture: TestingModule;
  let controller: EscrowController;
  let walletRepository: InMemoryRepository<WalletEntity>;
  let escrowRepository: InMemoryRepository<EscrowEntity>;
  let disputeRepository: InMemoryRepository<DisputeEntity>;
  let transactionRepository: InMemoryRepository<TransactionEntity>;
  let escrowService: EscrowService;

  let senderWallet: WalletEntity;
  let beneficiaryWallet: WalletEntity;
  let senderUserId: string;
  let beneficiaryUserId: string;
  const sentNotifications: Array<{ type: string; userId?: string; payload: Record<string, any> }> = [];

  beforeAll(async () => {
    walletRepository = new InMemoryRepository<WalletEntity>();
    escrowRepository = new InMemoryRepository<EscrowEntity>();
    disputeRepository = new InMemoryRepository<DisputeEntity>();
    transactionRepository = new InMemoryRepository<TransactionEntity>();

    const repositories = new Map<Function, InMemoryRepository<any>>([
      [WalletEntity, walletRepository],
      [EscrowEntity, escrowRepository],
      [DisputeEntity, disputeRepository],
      [TransactionEntity, transactionRepository],
    ]);

    const notificationServiceMock = {
      send: jest.fn(async (notification: { type: string; userId?: string; payload: Record<string, any> }) => {
        sentNotifications.push(notification);
        return { queued: true };
      }),
    };

    const jwtGuardMock = {
      canActivate: (context: any) => {
        const req = context.switchToHttp().getRequest();
        const userId = req.headers['x-user-id'];
        req.user = { id: userId, sub: userId };
        return true;
      },
    };

    moduleFixture = await Test.createTestingModule({
      controllers: [EscrowController],
      providers: [
        EscrowService,
        AutoReleaseJob,
        {
          provide: NotificationService,
          useValue: notificationServiceMock,
        },
        {
          provide: DataSource,
          useValue: new FakeDataSource(repositories),
        },
        {
          provide: getRepositoryToken(EscrowEntity),
          useValue: escrowRepository,
        },
        {
          provide: getRepositoryToken(WalletEntity),
          useValue: walletRepository,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: transactionRepository,
        },
        {
          provide: getRepositoryToken(DisputeEntity),
          useValue: disputeRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuardMock)
      .compile();

    escrowService = moduleFixture.get(EscrowService);
    const autoReleaseJob = moduleFixture.get(AutoReleaseJob);
    escrowService.registerAutoReleaseJob(autoReleaseJob);

    controller = moduleFixture.get(EscrowController);
  });

  beforeEach(async () => {
    sentNotifications.length = 0;
    await disputeRepository.clear();
    await escrowRepository.clear();
    await transactionRepository.clear();
    await walletRepository.clear();

    senderUserId = randomUUID();
    beneficiaryUserId = randomUUID();

    senderWallet = await walletRepository.save(
      walletRepository.create({
        id: randomUUID(),
        userId: senderUserId,
        publicKey: `sender-${Date.now()}`,
        name: 'Sender Wallet',
        type: 'fiat',
        status: 'active',
        availableBalance: 1000,
        escrowBalance: 0,
      }),
    );

    beneficiaryWallet = await walletRepository.save(
      walletRepository.create({
        id: randomUUID(),
        userId: beneficiaryUserId,
        publicKey: `beneficiary-${Date.now()}`,
        name: 'Beneficiary Wallet',
        type: 'fiat',
        status: 'active',
        availableBalance: 50,
        escrowBalance: 0,
      }),
    );
  });

  afterAll(async () => {
    await moduleFixture?.close();
  });

  it('locks funds atomically on escrow creation and notifies both parties', async () => {
    const response = await controller.create(mockRequest(senderUserId), {
        senderWalletId: senderWallet.id,
        beneficiaryWalletId: beneficiaryWallet.id,
        beneficiaryUserId,
        amount: 125.5,
        currency: 'USD',
        releaseParty: 'BENEFICIARY',
        releaseCondition: 'Project approved',
      });

    expect(response.success).toBe(true);
    expect(response.data.status).toBe('PENDING_RELEASE');

    const refreshedSenderWallet = await walletRepository.findOneByOrFail({ id: senderWallet.id });
    expect(Number(refreshedSenderWallet.availableBalance)).toBeCloseTo(874.5, 8);
    expect(Number(refreshedSenderWallet.escrowBalance)).toBeCloseTo(125.5, 8);

    const lockTransaction = await transactionRepository.findOneByOrFail({
      id: response.data.lockTransactionId,
    });
    expect(lockTransaction.metadata?.type).toBe('ESCROW_LOCK');
    expect(sentNotifications.filter((item) => item.type === 'ESCROW_CREATED')).toHaveLength(2);
  });

  it('releases only when the designated release party authorizes it', async () => {
    const escrow = await createEscrow('BENEFICIARY');

    await expect(
      controller.release(escrow.id, mockRequest(senderUserId), { note: 'unauthorized attempt' }),
    ).rejects.toBeInstanceOf(ConflictException);

    const releaseResponse = await controller.release(escrow.id, mockRequest(beneficiaryUserId), {
      note: 'milestone complete',
    });

    expect(releaseResponse.data.status).toBe('RELEASED');

    const refreshedSenderWallet = await walletRepository.findOneByOrFail({ id: senderWallet.id });
    const refreshedBeneficiaryWallet = await walletRepository.findOneByOrFail({
      id: beneficiaryWallet.id,
    });
    expect(Number(refreshedSenderWallet.escrowBalance)).toBeCloseTo(0, 8);
    expect(Number(refreshedBeneficiaryWallet.availableBalance)).toBeCloseTo(175, 8);
    expect(sentNotifications.filter((item) => item.type === 'ESCROW_RELEASED')).toHaveLength(2);
  });

  it('auto-releases at the configured timestamp', async () => {
    const autoReleaseAt = new Date(Date.now() + 250).toISOString();

    const createResponse = await controller.create(mockRequest(senderUserId), {
        senderWalletId: senderWallet.id,
        beneficiaryWalletId: beneficiaryWallet.id,
        beneficiaryUserId,
        amount: 80,
        currency: 'USD',
        releaseParty: 'SENDER',
        autoReleaseAt,
      });

    const escrowId = createResponse.data.id;

    await waitFor(async () => {
      const escrow = await escrowRepository.findOneByOrFail({ id: escrowId });
      return escrow.status === 'AUTO_RELEASED';
    });

    const releasedEscrow = await escrowRepository.findOneByOrFail({ id: escrowId });
    expect(releasedEscrow.status).toBe('AUTO_RELEASED');

    const refreshedSenderWallet = await walletRepository.findOneByOrFail({ id: senderWallet.id });
    const refreshedBeneficiaryWallet = await walletRepository.findOneByOrFail({
      id: beneficiaryWallet.id,
    });
    expect(Number(refreshedSenderWallet.escrowBalance)).toBeCloseTo(0, 8);
    expect(Number(refreshedBeneficiaryWallet.availableBalance)).toBeCloseTo(130, 8);
    expect(sentNotifications.filter((item) => item.type === 'ESCROW_AUTO_RELEASED')).toHaveLength(2);
  });

  it('creates a dispute, pauses release, and notifies both parties', async () => {
    const escrow = await createEscrow('SENDER', new Date(Date.now() + 500).toISOString());

    const disputeResponse = await controller.dispute(
      escrow.id,
      mockRequest(beneficiaryUserId),
      { reason: 'Deliverable quality issue' },
    );

    expect(disputeResponse.data.status).toBe('DISPUTED');

    const dispute = await disputeRepository.findOneByOrFail({
      subjectType: 'ESCROW',
      subjectId: escrow.id,
    });
    expect(dispute.reason).toBe('Deliverable quality issue');

    await new Promise((resolve) => setTimeout(resolve, 700));
    const unchangedEscrow = await escrowRepository.findOneByOrFail({ id: escrow.id });
    expect(unchangedEscrow.status).toBe('DISPUTED');
    expect(sentNotifications.filter((item) => item.type === 'ESCROW_DISPUTED')).toHaveLength(2);
  });

  it('cancels pending escrow and reverses the full amount to sender', async () => {
    const escrow = await createEscrow('SENDER');

    const cancelResponse = await controller.cancel(escrow.id, mockRequest(senderUserId), {
      reason: 'Trade called off',
    });

    expect(cancelResponse.data.status).toBe('CANCELLED');

    const refreshedSenderWallet = await walletRepository.findOneByOrFail({ id: senderWallet.id });
    expect(Number(refreshedSenderWallet.availableBalance)).toBeCloseTo(1000, 8);
    expect(Number(refreshedSenderWallet.escrowBalance)).toBeCloseTo(0, 8);

    const cancellationTx = await transactionRepository.findOneByOrFail({
      id: cancelResponse.data.cancellationTransactionId,
    });
    expect(cancellationTx.metadata?.type).toBe('ESCROW_CANCELLATION');
    expect(sentNotifications.filter((item) => item.type === 'ESCROW_CANCELLED')).toHaveLength(2);
  });

  async function createEscrow(
    releaseParty: 'SENDER' | 'BENEFICIARY',
    autoReleaseAt?: string,
  ): Promise<EscrowEntity> {
    const response = await controller.create(mockRequest(senderUserId), {
        senderWalletId: senderWallet.id,
        beneficiaryWalletId: beneficiaryWallet.id,
        beneficiaryUserId,
        amount: 125,
        currency: 'USD',
        releaseParty,
        autoReleaseAt,
      });

    return escrowRepository.findOneByOrFail({ id: response.data.id });
  }

  async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000, intervalMs = 50) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await check()) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  function mockRequest(userId: string) {
    return {
      user: {
        id: userId,
        sub: userId,
      },
      headers: {
        'x-user-id': userId,
      },
    };
  }
});
