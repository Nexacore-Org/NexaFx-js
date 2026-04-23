import { DataSource } from 'typeorm';
import {
  NotificationPreferenceEntity,
  NOTIFICATION_TYPES,
} from '../../modules/notifications/entities/notification-preference.entity';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function seedNotificationPreferences(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(NotificationPreferenceEntity);

  for (const type of NOTIFICATION_TYPES) {
    await repo.upsert(
      {
        userId: SYSTEM_USER_ID,
        notificationType: type,
        inApp: true,
        push: true,
        sms: false,
        email: true,
      } as NotificationPreferenceEntity,
      ['userId', 'notificationType'],
    );
  }

  console.log(`Seeded ${NOTIFICATION_TYPES.length} default notification preferences`);
}
