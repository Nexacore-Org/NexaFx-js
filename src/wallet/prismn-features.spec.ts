import { WalletsService } from './wallets.service';
import { StellarService } from '../stellar/stellar.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import {
  NotificationChannel,
  NotificationEventType,
} from '../notification-preferences/notification-preference.entity';
import { Transaction } from '../transactions/transaction.entity';

describe('prismn Features (Issues #976, #934, #921, #920)', () => {
  it('WalletsService supports configurable auto-sweep for wallet balance management', async () => {
    const mockRepo = {
      findOne: jest.fn().mockResolvedValue({
        balance: 1500,
        accountId: 'user-1',
        currency: 'USD',
      }),
    };
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn().mockResolvedValue({
          balance: 1500,
          accountId: 'user-1',
          currency: 'USD',
        }),
        getRepository: jest.fn().mockReturnValue({
          create: jest.fn((value: unknown) => ({
            ...(value as Record<string, unknown>),
          })),
          save: jest.fn((value: unknown) =>
            Promise.resolve({
              ...(value as Record<string, unknown>),
              id: 'tx-sweep',
            }),
          ),
        }),
      },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new WalletsService(mockRepo as any, dataSource as any);

    service.setAutoSweepConfig(
      'user-1',
      1000,
      'GAWDHZBVOL55CM2PJIG6NUVDKFT35REQRPNWLNTA244LAGO3HLEJUTJ4',
    );
    const config = service.getAutoSweepConfig('user-1');
    expect(config?.threshold).toBe(1000);

    jest.spyOn(service, 'adjustBalance').mockResolvedValue({} as any);

    const result = await service.processAutoSweep('user-1', 'USD');
    expect(result.swept).toBe(true);
    expect(result.sweepAmount).toBe('500.00000000');
  });

  it('StellarService validates payment memo text and ID constraints', () => {
    const service = new StellarService({ get: () => '' } as any, {} as any);

    const textMemo = service.validateAndFormatMemo('text', 'payment-ref-123');
    expect(textMemo.valid).toBe(true);

    expect(() => service.validateAndFormatMemo('text', 'x'.repeat(30))).toThrow(
      'Stellar text memo cannot exceed 28 bytes',
    );
  });

  it('TransactionsService exports transaction history as CSV', async () => {
    const txService = new TransactionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(txService, 'findHistory').mockResolvedValue({
      items: [
        {
          id: 'tx-1',
          reference: 'ref-1',
          senderId: 'u1',
          receiverId: 'u2',
          amount: 100,
          currency: 'USD',
          status: 'COMPLETED',
          createdAt: new Date(),
        } as unknown as Transaction,
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const csv = await txService.exportTransactionsCsv('u1');
    expect(csv).toContain('id,reference,senderId');
    expect(csv).toContain('tx-1');
  });

  it('NotificationPreferencesService manages user channel preferences', async () => {
    const mockRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto: unknown) => dto),
      save: jest.fn().mockImplementation((doc: unknown) => doc),
      upsert: jest.fn().mockResolvedValue(undefined),
      findOneOrFail: jest
        .fn()
        .mockResolvedValue({ isEnabled: false, batchingEnabled: true }),
    };
    const prefService = new NotificationPreferencesService(mockRepo as any);

    const updated = await prefService.updatePreference('user-1', {
      channel: NotificationChannel.EMAIL,
      eventType: NotificationEventType.TRANSACTION,
      isEnabled: false,
    });

    expect(updated.isEnabled).toBe(false);
  });
});
