import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TransactionLifecycleService } from './transaction-lifecycle.service';
import { TransactionEntity } from '../entities/transaction.entity';
import {
  TRANSACTION_CREATED,
  TRANSACTION_PROCESSING,
  TRANSACTION_COMPLETED,
  TRANSACTION_FAILED,
} from '../events';

describe('TransactionLifecycleService (event sequence)', () => {
  let service: TransactionLifecycleService;
  let eventEmitter: EventEmitter2;
  let txRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  const mockTx: TransactionEntity = {
    id: 'tx-123',
    amount: 100,
    currency: 'USD',
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as TransactionEntity;

  beforeEach(async () => {
    txRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...mockTx, ...dto })),
      save: jest.fn().mockResolvedValue(mockTx),
      findOne: jest.fn().mockResolvedValue({ ...mockTx, id: 'tx-123' }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const mockManager = {
      getRepository: jest.fn().mockReturnValue(txRepo),
    };

    const mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionLifecycleService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: txRepo,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    service = module.get(TransactionLifecycleService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('emits TRANSACTION_CREATED after create transaction commits', async () => {
    await service.create({
      amount: 100,
      currency: 'USD',
      description: 'Test',
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      TRANSACTION_CREATED,
      expect.objectContaining({
        transactionId: mockTx.id,
        amount: 100,
        currency: 'USD',
      }),
    );
    expect((eventEmitter.emit as jest.Mock).mock.calls[0][1]).toHaveProperty('timestamp');
  });

  it('emits TRANSACTION_PROCESSING after markProcessing commits', async () => {
    await service.markProcessing('tx-123');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      TRANSACTION_PROCESSING,
      expect.objectContaining({
        transactionId: 'tx-123',
        startedAt: expect.any(Date),
      }),
    );
  });

  it('emits TRANSACTION_COMPLETED after markCompleted commits', async () => {
    await service.markCompleted('tx-123', { durationMs: 50 });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      TRANSACTION_COMPLETED,
      expect.objectContaining({
        transactionId: 'tx-123',
        completedAt: expect.any(Date),
        durationMs: 50,
      }),
    );
  });

  it('emits TRANSACTION_FAILED after markFailed commits', async () => {
    await service.markFailed('tx-123', {
      message: 'Insufficient funds',
      code: 'INSUFFICIENT_FUNDS',
      retryable: true,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      TRANSACTION_FAILED,
      expect.objectContaining({
        transactionId: 'tx-123',
        failedAt: expect.any(Date),
        errorMessage: 'Insufficient funds',
        errorCode: 'INSUFFICIENT_FUNDS',
        retryable: true,
      }),
    );
  });

  it('emits events only after DB transaction commits (emit not called during transaction)', async () => {
    const emitOrder: string[] = [];
    (eventEmitter.emit as jest.Mock).mockImplementation((event: string) => {
      emitOrder.push(event);
      return true;
    });

    await service.create({ amount: 50, currency: 'EUR' });
    await service.markProcessing(mockTx.id);
    await service.markCompleted(mockTx.id, { durationMs: 100 });

    expect(emitOrder).toEqual([
      TRANSACTION_CREATED,
      TRANSACTION_PROCESSING,
      TRANSACTION_COMPLETED,
    ]);
  });
});
