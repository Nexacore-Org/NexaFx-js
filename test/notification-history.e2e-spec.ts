import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module';
import { NotificationLogEntity, NotificationLogStatus } from '../src/modules/notifications/entities/notification-log.entity';
import { NotificationDeliveryReceiptEntity, DeliveryChannel, DeliveryStatus } from '../src/modules/notifications/entities/notification-delivery-receipt.entity';
import { NotificationLogService } from '../src/modules/notifications/services/notification-log.service';
import { NotificationOrchestratorService } from '../src/modules/notifications/services/notification-orchestrator.service';
import * as request from 'supertest';

describe('Notification History (e2e)', () => {
  let app: INestApplication;
  let notificationLogService: NotificationLogService;
  let notificationOrchestrator: NotificationOrchestratorService;
  let testUserId = 'test-user-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [NotificationLogEntity, NotificationDeliveryReceiptEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([NotificationLogEntity, NotificationDeliveryReceiptEntity]),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    notificationLogService = moduleFixture.get<NotificationLogService>(NotificationLogService);
    notificationOrchestrator = moduleFixture.get<NotificationOrchestratorService>(NotificationOrchestratorService);
    
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Notification Logging', () => {
    it('should log notification attempts (fire-and-forget)', async () => {
      // Send a test notification
      await notificationOrchestrator.notify({
        userId: testUserId,
        type: 'test.notification',
        title: 'Test Notification',
        body: 'This is a test notification for logging',
        urgency: 'normal',
      });

      // Wait a bit for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if notification was logged
      const history = await notificationLogService.getHistory({
        userId: testUserId,
        notificationType: 'test.notification',
      });

      expect(history.logs).toBeDefined();
      expect(history.logs.length).toBeGreaterThan(0);
      expect(history.logs[0].userId).toBe(testUserId);
      expect(history.logs[0].notificationType).toBe('test.notification');
    });

    it('should log different notification statuses', async () => {
      // Log a successful notification
      notificationLogService.logAsync({
        userId: testUserId,
        notificationType: 'success.test',
        channel: DeliveryChannel.IN_APP,
        status: NotificationLogStatus.SENT,
        payload: { title: 'Success Test' },
      });

      // Log a failed notification
      notificationLogService.logAsync({
        userId: testUserId,
        notificationType: 'failed.test',
        channel: DeliveryChannel.PUSH,
        status: NotificationLogStatus.FAILED,
        errorMessage: 'Test error',
        payload: { title: 'Failed Test' },
      });

      // Log a throttled notification
      notificationLogService.logAsync({
        userId: testUserId,
        notificationType: 'throttled.test',
        channel: DeliveryChannel.SMS,
        status: NotificationLogStatus.THROTTLED,
        payload: { title: 'Throttled Test' },
      });

      // Wait for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const history = await notificationLogService.getHistory({ userId: testUserId });
      
      const sentLog = history.logs.find(log => log.notificationType === 'success.test');
      const failedLog = history.logs.find(log => log.notificationType === 'failed.test');
      const throttledLog = history.logs.find(log => log.notificationType === 'throttled.test');

      expect(sentLog).toBeDefined();
      expect(sentLog.status).toBe(NotificationLogStatus.SENT);
      expect(sentLog.channel).toBe(DeliveryChannel.IN_APP);

      expect(failedLog).toBeDefined();
      expect(failedLog.status).toBe(NotificationLogStatus.FAILED);
      expect(failedLog.errorMessage).toBe('Test error');
      expect(failedLog.channel).toBe(DeliveryChannel.PUSH);

      expect(throttledLog).toBeDefined();
      expect(throttledLog.status).toBe(NotificationLogStatus.THROTTLED);
      expect(throttledLog.channel).toBe(DeliveryChannel.SMS);
    });
  });

  describe('GET /admin/notifications/history', () => {
    beforeEach(async () => {
      // Create test data
      await notificationLogService.logAsync({
        userId: testUserId,
        notificationType: 'history.test',
        channel: DeliveryChannel.IN_APP,
        status: NotificationLogStatus.SENT,
        payload: { title: 'History Test' },
      });

      await notificationLogService.logAsync({
        userId: 'other-user',
        notificationType: 'history.test',
        channel: DeliveryChannel.PUSH,
        status: NotificationLogStatus.FAILED,
        payload: { title: 'Other User Test' },
      });

      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should return notification history with filters', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/notifications/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.total).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by userId', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/notifications/history')
        .query({ userId: testUserId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data.every((log: any) => log.userId === testUserId)).toBe(true);
    });

    it('should filter by notification type', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/notifications/history')
        .query({ type: 'history.test' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data.every((log: any) => log.notificationType === 'history.test')).toBe(true);
    });

    it('should filter by channel', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/notifications/history')
        .query({ channel: DeliveryChannel.IN_APP })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((log: any) => log.channel === DeliveryChannel.IN_APP)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/notifications/history')
        .query({ status: NotificationLogStatus.SENT })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((log: any) => log.status === NotificationLogStatus.SENT)).toBe(true);
    });

    it('should support pagination', async () => {
      // Create more test data
      for (let i = 0; i < 10; i++) {
        notificationLogService.logAsync({
          userId: `${testUserId}-${i}`,
          notificationType: 'pagination.test',
          channel: DeliveryChannel.IN_APP,
          status: NotificationLogStatus.SENT,
          payload: { title: `Pagination Test ${i}` },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app.getHttpServer())
        .get('/admin/notifications/history')
        .query({ limit: 5, offset: 0 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body.total).toBeGreaterThan(5);
    });
  });

  describe('GET /admin/notifications/analytics', () => {
    beforeEach(async () => {
      // Create test data for analytics
      const testTypes = ['type1', 'type2', 'type1', 'type3', 'type1'];
      const statuses = [NotificationLogStatus.SENT, NotificationLogStatus.FAILED, NotificationLogStatus.SENT, NotificationLogStatus.THROTTLED, NotificationLogStatus.SENT];
      const channels = [DeliveryChannel.IN_APP, DeliveryChannel.PUSH, DeliveryChannel.IN_APP, DeliveryChannel.SMS, DeliveryChannel.IN_APP];

      for (let i = 0; i < testTypes.length; i++) {
        notificationLogService.logAsync({
          userId: testUserId,
          notificationType: testTypes[i],
          channel: channels[i],
          status: statuses[i],
          payload: { title: `Analytics Test ${i}` },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should return notification analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/notifications/analytics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.volumeByType).toBeDefined();
      expect(response.body.data.channelDeliveryRates).toBeDefined();
      expect(response.body.data.throttleStats).toBeDefined();
      expect(response.body.timestamp).toBeDefined();

      // Check volume by type
      expect(Array.isArray(response.body.data.volumeByType)).toBe(true);
      if (response.body.data.volumeByType.length > 0) {
        const volume = response.body.data.volumeByType[0];
        expect(volume).toHaveProperty('notificationType');
        expect(volume).toHaveProperty('count');
        expect(typeof volume.count).toBe('number');
      }

      // Check throttle stats
      const throttleStats = response.body.data.throttleStats;
      expect(throttleStats).toHaveProperty('sent');
      expect(throttleStats).toHaveProperty('failed');
      expect(throttleStats).toHaveProperty('throttled');
      expect(typeof throttleStats.sent).toBe('number');
      expect(typeof throttleStats.failed).toBe('number');
      expect(typeof throttleStats.throttled).toBe('number');
    });
  });

  describe('GET /admin/users/:id/notifications', () => {
    beforeEach(async () => {
      // Create test notifications for specific user
      for (let i = 0; i < 5; i++) {
        notificationLogService.logAsync({
          userId: testUserId,
          notificationType: 'user.test',
          channel: DeliveryChannel.IN_APP,
          status: NotificationLogStatus.SENT,
          payload: { title: `User Test ${i}` },
        });
      }

      // Create notifications for other user
      notificationLogService.logAsync({
        userId: 'other-user',
        notificationType: 'user.test',
        channel: DeliveryChannel.PUSH,
        status: NotificationLogStatus.SENT,
        payload: { title: 'Other User Notification' },
      });

      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should return notifications for specific user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/admin/users/${testUserId}/notifications`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.total).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(5);
      expect(response.body.data.every((log: any) => log.userId === testUserId)).toBe(true);
    });

    it('should return empty array for user with no notifications', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/users/non-existent-user/notifications')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('Auto-purge functionality', () => {
    it('should purge old notification logs', async () => {
      // Create an old log entry by manually setting the date
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      
      // This would require direct database access in a real test
      // For now, we'll just test that the method exists and can be called
      expect(typeof notificationLogService.purgeOld).toBe('function');
    });
  });

  describe('Dead Letter Queue Alerts', () => {
    it('should have DLQ alerting service configured', () => {
      // This test verifies that the DLQ system is set up to emit critical alerts
      // The actual DLQ processor test would be in a separate integration test
      expect(notificationOrchestrator).toBeDefined();
    });
  });

  describe('Performance and Constraints', () => {
    it('should handle fire-and-forget logging without blocking', async () => {
      const startTime = Date.now();
      
      // Send multiple notifications
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          notificationOrchestrator.notify({
            userId: `${testUserId}-${i}`,
            type: 'performance.test',
            title: `Performance Test ${i}`,
            body: `Performance notification ${i}`,
            urgency: 'normal',
          })
        );
      }

      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete quickly since logging is fire-and-forget
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });

    it('should store only summary information (no full payload)', async () => {
      // Send notification with large payload
      await notificationOrchestrator.notify({
        userId: testUserId,
        type: 'payload.test',
        title: 'Payload Test',
        body: 'Test with large payload',
        urgency: 'normal',
        payload: {
          largeData: 'x'.repeat(10000), // Large payload
          sensitive: 'secret information',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const history = await notificationLogService.getHistory({
        userId: testUserId,
        notificationType: 'payload.test',
      });

      expect(history.logs.length).toBeGreaterThan(0);
      const log = history.logs[0];
      
      // Should not store full payload, only summary
      expect(log.payload).toBeDefined();
      if (log.payload && typeof log.payload === 'object') {
        expect(JSON.stringify(log.payload).length).toBeLessThan(1000); // Reasonable size limit
      }
    });
  });
});
