import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationListener } from './notification.listener';
import { NotificationBatchingService } from './notification-batching.service';
import { NotificationEventType } from '../notification-preferences/notification-preference.entity';
import {
  TransactionEvent,
  TransactionReversedEvent,
  TransferCompletedEvent,
} from '../common/events/transaction-events';

/**
 * #1448: the listener previously subscribed to `transaction.completed`
 * (singular) while `TransactionsService` emitted `transactions.completed`
 * (plural), so no push notification ever fired. These tests emit the *real*
 * event names through a real `EventEmitter2` instance — exactly how the
 * application wires them — and assert the right users are notified.
 */
describe('NotificationListener (#1448)', () => {
  type DispatchCall = [
    userId: string,
    eventType: NotificationEventType,
    payload: { title: string; body: string; data?: Record<string, unknown> },
  ];
  let module: TestingModule;
  let emitter: EventEmitter2;
  let dispatch: jest.Mock<void, DispatchCall>;

  beforeEach(async () => {
    dispatch = jest.fn<void, DispatchCall>().mockResolvedValue(undefined);

    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        NotificationListener,
        {
          provide: NotificationBatchingService,
          useValue: { dispatch },
        },
      ],
    }).compile();

    await module.init();
    emitter = module.get(EventEmitter2);
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  async function emitAndSettle(event: string, payload: unknown): Promise<void> {
    await emitter.emitAsync(event, payload);
  }

  it('notifies both sender and receiver for a transfer (direction-specific copy)', async () => {
    const payload: TransferCompletedEvent = {
      transactionId: 'tx-1',
      senderId: 'user-sender',
      receiverId: 'user-receiver',
      amount: '100',
      currency: 'USD',
    };

    await emitAndSettle(TransactionEvent.COMPLETED, payload);

    const notifiedUserIds = dispatch.mock.calls.map((call) => call[0]);
    expect(notifiedUserIds).toEqual(
      expect.arrayContaining(['user-sender', 'user-receiver']),
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
    const senderCall = dispatch.mock.calls.find(
      (call) => call[0] === 'user-sender',
    );
    const receiverCall = dispatch.mock.calls.find(
      (call) => call[0] === 'user-receiver',
    );
    expect(senderCall?.[2].body).toContain('sent');
    expect(receiverCall?.[2].body).toContain('received');
    expect(senderCall?.[1]).toBe(NotificationEventType.TRANSACTION);
    expect(receiverCall?.[1]).toBe(NotificationEventType.TRANSACTION);
  });

  it('notifies a self-transfer only once', async () => {
    await emitAndSettle(TransactionEvent.COMPLETED, {
      transactionId: 'tx-self',
      senderId: 'user-a',
      receiverId: 'user-a',
      amount: '5',
      currency: 'EUR',
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      'user-a',
      NotificationEventType.TRANSACTION,
      expect.any(Object),
    );
  });

  it.each([
    [TransactionEvent.DEPOSIT_COMPLETED, 'Deposit Completed'],
    [TransactionEvent.WITHDRAWAL_COMPLETED, 'Withdrawal Completed'],
    [TransactionEvent.SWAP_COMPLETED, 'Swap Completed'],
    [TransactionEvent.SWAP_FAILED, 'Swap Failed'],
  ])('notifies the affected user on %s', async (event, expectedTitle) => {
    await emitAndSettle(event, { transactionId: 'tx-2', userId: 'user-2' });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      'user-2',
      NotificationEventType.TRANSACTION,
      expect.objectContaining({ title: expectedTitle }),
    );
  });

  it('notifies both parties when a transfer is reversed', async () => {
    const payload: TransactionReversedEvent = {
      transactionId: 'tx-3',
      reversalTransactionId: 'rev-3',
      reversedBy: 'admin-1',
      reason: 'fraud',
      senderId: 'user-s',
      receiverId: 'user-r',
    };

    await emitAndSettle(TransactionEvent.REVERSED, payload);

    const notifiedUserIds = dispatch.mock.calls.map((call) => call[0]);
    expect(new Set(notifiedUserIds)).toEqual(new Set(['user-s', 'user-r']));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('does not notify anyone for a reversal with no known party', async () => {
    await emitAndSettle(TransactionEvent.REVERSED, {
      transactionId: 'tx-4',
      reversalTransactionId: 'rev-4',
      reversedBy: 'admin-1',
      reason: 'fraud',
    });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
