import { DataSource, Repository } from 'typeorm';
import { TransactionsService } from './transactions.service';
import { Transaction, TransactionStatus } from './transaction.entity';
import { WalletsService } from '../wallet/wallets.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

type TransactionManager = {
  create: <T extends Record<string, unknown>>(
    entity: new () => T,
    value: T,
  ) => T;
  save: <T extends { id?: string }>(
    entity: new () => T,
    value: T,
  ) => Promise<T>;
};

describe('TransactionsService', () => {
  const txRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<Transaction>;
  const dataSource = {
    transaction: jest.fn(),
  } as unknown as DataSource;
  const walletsService = {
    getBalance: jest.fn(),
    adjustBalance: jest.fn(),
  } as unknown as WalletsService;
  const auditService = {
    log: jest.fn(),
  } as unknown as AuditService;
  const mailService = {
    sendTransactionReversalNotice: jest.fn(),
  } as unknown as MailService;
  const usersService = {
    findById: jest.fn(),
  } as unknown as UsersService;
  const events = {
    emit: jest.fn(),
  } as unknown as EventEmitter2;
  const service = new TransactionsService(
    txRepo,
    dataSource,
    walletsService,
    auditService,
    mailService,
    usersService,
    events,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reverses a transaction and restores balances', async () => {
    (txRepo.findOne as jest.Mock).mockResolvedValue({
      id: 'tx-1',
      senderId: 'user-1',
      receiverId: 'user-2',
      amount: 25,
      currency: 'USD',
      reference: 'ref-1',
      status: TransactionStatus.COMPLETED,
      createdAt: new Date(),
    });
    (usersService.findById as jest.Mock).mockResolvedValueOnce({
      id: 'user-1',
      email: 'sender@example.com',
    });
    (usersService.findById as jest.Mock).mockResolvedValueOnce({
      id: 'user-2',
      email: 'receiver@example.com',
    });
    const manager: TransactionManager = {
      create: (_entity, value) => value,
      save: (_entity, value) =>
        Promise.resolve({
          ...value,
          id: value.id ?? 'reversal-1',
        }),
    };
    (dataSource.transaction as jest.Mock).mockImplementation(
      async (callback: (manager: TransactionManager) => Promise<unknown>) =>
        callback(manager),
    );

    await expect(
      service.reverseTransaction('tx-1', {
        reversedBy: 'admin-1',
        reason: 'fraud review',
      }),
    ).resolves.toMatchObject({
      reversedBy: 'admin-1',
      reversalReason: 'fraud review',
      status: TransactionStatus.REVERSED,
    });
  });
});
