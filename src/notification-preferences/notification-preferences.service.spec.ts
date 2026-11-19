import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  NotificationChannel,
  NotificationEventType,
  NotificationPreference,
} from './notification-preference.entity';
import { NotificationPreferencesService } from './notification-preferences.service';

function build() {
  const writes: unknown[] = [];
  const upsert = jest.fn((value: unknown) => {
    writes.push(value);
    return Promise.resolve();
  });
  const findOneOrFail = jest.fn(
    (args: { where: Partial<NotificationPreference> }) =>
      Promise.resolve({
        id: 'pref-1',
        ...args.where,
      } as NotificationPreference),
  );
  const findOne = jest.fn();
  const create = jest.fn();
  const save = jest.fn();
  const manager = {
    transaction: jest.fn(async (callback: (m: any) => Promise<unknown>) => {
      try {
        return await callback({
          getRepository: () => ({ upsert, findOneOrFail }),
        });
      } catch (error) {
        writes.length = 0;
        throw error;
      }
    }),
  };
  const repo = {
    findOne,
    findOneOrFail,
    upsert,
    create,
    save,
    manager,
  } as unknown as Repository<NotificationPreference>;
  return {
    service: new NotificationPreferencesService(repo),
    repo,
    upsert,
    findOneOrFail,
    findOne,
    create,
    save,
    manager,
    writes,
  };
}

const preference = {
  channel: NotificationChannel.EMAIL,
  eventType: NotificationEventType.TRANSACTION,
  isEnabled: false,
};

describe('NotificationPreferencesService', () => {
  it('upserts a single preference without a find-then-save', async () => {
    const { service, upsert, findOne, create, save } = build();
    await service.updatePreference('user-1', preference);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        channel: NotificationChannel.EMAIL,
        eventType: NotificationEventType.TRANSACTION,
        isEnabled: false,
        batchingEnabled: true,
      }),
      { conflictPaths: ['userId', 'channel', 'eventType'] },
    );
    expect(findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('upserts a batch atomically inside one transaction', async () => {
    const { service, manager, upsert } = build();
    const results = await service.updatePreferences('user-1', [
      preference,
      {
        channel: NotificationChannel.PUSH,
        eventType: NotificationEventType.KYC,
        isEnabled: true,
        batchingEnabled: false,
      },
    ]);

    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ batchingEnabled: false }),
      { conflictPaths: ['userId', 'channel', 'eventType'] },
    );
  });

  it('deduplicates a batch before writing', async () => {
    const { service, upsert } = build();
    await service.updatePreferences('user-1', [
      preference,
      { ...preference, isEnabled: true },
    ]);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('leaves no writes when a batch upsert fails', async () => {
    const { service, upsert, writes } = build();
    upsert
      .mockRejectedValueOnce(new Error('db failure'))
      .mockResolvedValue(undefined);

    await expect(
      service.updatePreferences('user-1', [
        preference,
        {
          channel: NotificationChannel.PUSH,
          eventType: NotificationEventType.KYC,
          isEnabled: true,
        },
      ]),
    ).rejects.toThrow('db failure');
    expect(writes).toEqual([]);
  });

  it('allows concurrent batches to complete without a read-modify-write race', async () => {
    const { service, upsert } = build();
    const batch = [
      preference,
      {
        channel: NotificationChannel.IN_APP,
        eventType: NotificationEventType.SYSTEM,
        isEnabled: true,
      },
    ];
    const results = await Promise.all([
      service.updatePreferences('user-1', batch),
      service.updatePreferences('user-2', batch),
    ]);

    expect(results.map((items) => items.length)).toEqual([2, 2]);
    expect(upsert).toHaveBeenCalledTimes(4);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2' }),
      { conflictPaths: ['userId', 'channel', 'eventType'] },
    );
  });

  it.each([NotificationChannel.EMAIL, NotificationChannel.PUSH])(
    'refuses to disable mandatory %s security notifications',
    async (channel) => {
      const { service, upsert } = build();
      const dto = {
        channel,
        eventType: NotificationEventType.SECURITY,
        isEnabled: false,
      };

      await expect(
        service.updatePreference('user-1', dto),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updatePreferences('user-1', [dto]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('always notifies mandatory security pairs even when a row is disabled', async () => {
    const { service, findOne } = build();
    findOne.mockResolvedValue({ isEnabled: false });

    await expect(
      service.shouldNotify(
        'user-1',
        NotificationChannel.EMAIL,
        NotificationEventType.SECURITY,
      ),
    ).resolves.toBe(true);
    await expect(
      service.shouldNotify(
        'user-1',
        NotificationChannel.PUSH,
        NotificationEventType.SECURITY,
      ),
    ).resolves.toBe(true);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('honours opt-outs for non-mandatory pairs', async () => {
    const { service, findOne } = build();
    findOne.mockResolvedValue({ isEnabled: false });

    await expect(
      service.shouldNotify(
        'user-1',
        NotificationChannel.PUSH,
        NotificationEventType.KYC,
      ),
    ).resolves.toBe(false);
  });
});
