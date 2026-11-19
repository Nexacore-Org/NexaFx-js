import { ConfigService } from '@nestjs/config';
import { NotificationBatchingService } from './notification-batching.service';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import {
  NotificationChannel,
  NotificationEventType,
} from '../notification-preferences/notification-preference.entity';

describe('NotificationBatchingService notifications opt-outs', () => {
  it('delegates opt-out checks to NotificationPreferencesService', async () => {
    const preferencesService = {
      shouldNotify: jest.fn().mockResolvedValue(true),
    };
    const config = {
      get: jest.fn().mockReturnValue('false'),
    } as unknown as ConfigService;
    const service = new NotificationBatchingService(
      config,
      {} as any,
      { sendToUser: jest.fn() } as any,
      preferencesService as unknown as NotificationPreferencesService,
    );

    await expect(
      (service as any).shouldNotify(
        'user-1',
        NotificationChannel.EMAIL,
        NotificationEventType.SECURITY,
      ),
    ).resolves.toBe(true);
    expect(preferencesService.shouldNotify).toHaveBeenCalledWith(
      'user-1',
      NotificationChannel.EMAIL,
      NotificationEventType.SECURITY,
    );
  });
});
