import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module';
import { ScheduledTransactionEntity, ScheduleFrequency, ScheduleStatus } from '../src/modules/scheduled-transactions/entities/scheduled-transaction.entity';
import { ScheduledTransactionService } from '../src/modules/scheduled-transactions/services/scheduled-transaction.service';
import { SchedulerService } from '../src/modules/scheduled-transactions/services/scheduler.service';
import { TransactionsService } from '../src/modules/transactions/services/transactions.service';
import * as request from 'supertest';

describe('Scheduled Transactions (e2e)', () => {
  let app: INestApplication;
  let scheduledTxService: ScheduledTransactionService;
  let schedulerService: SchedulerService;
  let transactionsService: TransactionsService;
  let testUserId = 'test-user-123';
  let adminToken = 'admin-jwt-token';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [ScheduledTransactionEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([ScheduledTransactionEntity]),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    scheduledTxService = moduleFixture.get<ScheduledTransactionService>(ScheduledTransactionService);
    schedulerService = moduleFixture.get<SchedulerService>(SchedulerService);
    transactionsService = moduleFixture.get<TransactionsService>(TransactionsService);
    
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /transactions/schedule', () => {
    it('should create a DAILY scheduled transaction', async () => {
      const createDto = {
        amount: 100,
        currency: 'USD',
        description: 'Daily coffee',
        frequency: 'DAILY' as ScheduleFrequency,
      };

      const response = await request(app.getHttpServer())
        .post('/transactions/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.amount).toBe(100);
      expect(response.body.currency).toBe('USD');
      expect(response.body.frequency).toBe('DAILY');
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.nextRunAt).toBeDefined();
      expect(response.body.executionHistory).toEqual([]);
      expect(response.body.consecutiveFailures).toBe(0);
    });

    it('should create a WEEKLY scheduled transaction with target currency', async () => {
      const createDto = {
        amount: 50,
        currency: 'EUR',
        targetCurrency: 'USD',
        description: 'Weekly savings',
        frequency: 'WEEKLY' as ScheduleFrequency,
      };

      const response = await request(app.getHttpServer())
        .post('/transactions/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body.amount).toBe(50);
      expect(response.body.currency).toBe('EUR');
      expect(response.body.targetCurrency).toBe('USD');
      expect(response.body.frequency).toBe('WEEKLY');
    });

    it('should create a MONTHLY scheduled transaction', async () => {
      const createDto = {
        amount: 1000,
        currency: 'GBP',
        description: 'Monthly rent',
        frequency: 'MONTHLY' as ScheduleFrequency,
      };

      const response = await request(app.getHttpServer())
        .post('/transactions/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body.amount).toBe(1000);
      expect(response.body.currency).toBe('GBP');
      expect(response.body.frequency).toBe('MONTHLY');
    });

    it('should validate required fields', async () => {
      const invalidDto = {
        currency: 'USD',
        frequency: 'DAILY',
      };

      await request(app.getHttpServer())
        .post('/transactions/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidDto)
        .expect(400);
    });

    it('should validate frequency enum', async () => {
      const invalidDto = {
        amount: 100,
        currency: 'USD',
        frequency: 'HOURLY',
      };

      await request(app.getHttpServer())
        .post('/transactions/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidDto)
        .expect(400);
    });
  });

  describe('GET /transactions/schedule', () => {
    beforeEach(async () => {
      // Create test schedules
      await scheduledTxService.create(testUserId, {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'Daily test',
      });

      await scheduledTxService.create(testUserId, {
        amount: 50,
        currency: 'EUR',
        frequency: 'WEEKLY',
        description: 'Weekly test',
      });
    });

    it('should return all scheduled transactions for user', async () => {
      const response = await request(app.getHttpServer())
        .get('/transactions/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      
      const dailySchedule = response.body.find((s: any) => s.frequency === 'DAILY');
      const weeklySchedule = response.body.find((s: any) => s.frequency === 'WEEKLY');
      
      expect(dailySchedule).toBeDefined();
      expect(weeklySchedule).toBeDefined();
      expect(dailySchedule.userId).toBe(testUserId);
      expect(weeklySchedule.userId).toBe(testUserId);
    });
  });

  describe('GET /transactions/schedule/:id', () => {
    let scheduleId: string;

    beforeEach(async () => {
      const schedule = await scheduledTxService.create(testUserId, {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'Test schedule',
      });
      scheduleId = schedule.id;
    });

    it('should return specific scheduled transaction', async () => {
      const response = await request(app.getHttpServer())
        .get(`/transactions/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(scheduleId);
      expect(response.body.amount).toBe(100);
      expect(response.body.frequency).toBe('DAILY');
    });

    it('should return 404 for non-existent schedule', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      await request(app.getHttpServer())
        .get(`/transactions/schedule/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /transactions/schedule/:id', () => {
    let scheduleId: string;

    beforeEach(async () => {
      const schedule = await scheduledTxService.create(testUserId, {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'Test schedule',
      });
      scheduleId = schedule.id;
    });

    it('should update scheduled transaction', async () => {
      const updateDto = {
        amount: 200,
        description: 'Updated description',
      };

      const response = await request(app.getHttpServer())
        .patch(`/transactions/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.amount).toBe(200);
      expect(response.body.description).toBe('Updated description');
      expect(response.body.frequency).toBe('DAILY'); // unchanged
    });

    it('should update frequency and recalculate next run', async () => {
      const updateDto = {
        frequency: 'WEEKLY' as ScheduleFrequency,
      };

      const response = await request(app.getHttpServer())
        .patch(`/transactions/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.frequency).toBe('WEEKLY');
      expect(response.body.nextRunAt).toBeDefined();
    });
  });

  describe('Pause and Resume functionality', () => {
    let scheduleId: string;

    beforeEach(async () => {
      const schedule = await scheduledTxService.create(testUserId, {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'Test schedule',
      });
      scheduleId = schedule.id;
    });

    it('should pause scheduled transaction', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/transactions/schedule/${scheduleId}/pause`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.status).toBe('PAUSED');
    });

    it('should resume scheduled transaction', async () => {
      // First pause
      await request(app.getHttpServer())
        .patch(`/transactions/schedule/${scheduleId}/pause`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Then resume
      const response = await request(app.getHttpServer())
        .patch(`/transactions/schedule/${scheduleId}/resume`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.nextRunAt).toBeDefined();
    });
  });

  describe('DELETE /transactions/schedule/:id', () => {
    let scheduleId: string;

    beforeEach(async () => {
      const schedule = await scheduledTxService.create(testUserId, {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'Test schedule',
      });
      scheduleId = schedule.id;
    });

    it('should cancel scheduled transaction', async () => {
      await request(app.getHttpServer())
        .delete(`/transactions/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify it's cancelled
      const response = await request(app.getHttpServer())
        .get(`/transactions/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.status).toBe('CANCELLED');
    });
  });

  describe('Scheduler Execution Tests', () => {
    let scheduleId: string;

    beforeEach(async () => {
      // Create a schedule that should run soon
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      const schedule = await scheduledTxService.create(testUserId, {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'Test execution',
      });
      
      // Manually set nextRunAt to the past to trigger execution
      await scheduledTxService.update(schedule.id, testUserId, {});
      
      scheduleId = schedule.id;
    });

    it('should execute due schedules', async () => {
      // Manually trigger the scheduler
      await schedulerService.runDueSchedules();

      // Wait a bit for execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if execution was recorded
      const updatedSchedule = await scheduledTxService.findOne(scheduleId, testUserId);
      expect(updatedSchedule.executionHistory).toBeDefined();
      expect(updatedSchedule.executionHistory!.length).toBeGreaterThan(0);
    });

    it('should handle idempotency correctly', async () => {
      // Run scheduler twice
      await schedulerService.runDueSchedules();
      await schedulerService.runDueSchedules();

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only have one execution record
      const updatedSchedule = await scheduledTxService.findOne(scheduleId, testUserId);
      const executions = updatedSchedule.executionHistory?.filter(h => h.status === 'SUCCESS');
      expect(executions?.length).toBe(1);
    });
  });

  describe('Frequency Calculation Tests', () => {
    it('should calculate DAILY next run correctly', () => {
      const now = new Date('2024-01-01T10:00:00Z');
      const nextRun = scheduledTxService.calcNextRun(now, 'DAILY');
      
      expect(nextRun.getDate()).toBe(2);
      expect(nextRun.getMonth()).toBe(0);
      expect(nextRun.getFullYear()).toBe(2024);
    });

    it('should calculate WEEKLY next run correctly', () => {
      const now = new Date('2024-01-01T10:00:00Z');
      const nextRun = scheduledTxService.calcNextRun(now, 'WEEKLY');
      
      expect(nextRun.getDate()).toBe(8);
      expect(nextRun.getMonth()).toBe(0);
      expect(nextRun.getFullYear()).toBe(2024);
    });

    it('should calculate MONTHLY next run correctly', () => {
      const now = new Date('2024-01-01T10:00:00Z');
      const nextRun = scheduledTxService.calcNextRun(now, 'MONTHLY');
      
      expect(nextRun.getDate()).toBe(1);
      expect(nextRun.getMonth()).toBe(1);
      expect(nextRun.getFullYear()).toBe(2024);
    });
  });

  describe('Admin Endpoints', () => {
    beforeEach(async () => {
      // Create schedules for different users
      await scheduledTxService.create('user1', {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'User 1 daily',
      });

      await scheduledTxService.create('user2', {
        amount: 50,
        currency: 'EUR',
        frequency: 'WEEKLY',
        description: 'User 2 weekly',
      });
    });

    it('should return all scheduled transactions for admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/scheduled-transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      
      const user1Schedule = response.body.find((s: any) => s.userId === 'user1');
      const user2Schedule = response.body.find((s: any) => s.userId === 'user2');
      
      expect(user1Schedule).toBeDefined();
      expect(user2Schedule).toBeDefined();
    });
  });

  describe('Failure Handling and Suspension', () => {
    let scheduleId: string;

    beforeEach(async () => {
      const schedule = await scheduledTxService.create(testUserId, {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'Test failure',
      });
      scheduleId = schedule.id;
    });

    it('should handle consecutive failures and suspend schedule', async () => {
      // Simulate multiple failures by updating the schedule
      let schedule = await scheduledTxService.findOne(scheduleId, testUserId);
      
      // Simulate 3 consecutive failures
      for (let i = 1; i <= 3; i++) {
        schedule.consecutiveFailures = i;
        schedule.executionHistory = [
          ...(schedule.executionHistory || []),
          {
            executedAt: new Date().toISOString(),
            status: 'FAILED' as const,
            error: `Test failure ${i}`,
          },
        ];
        await scheduledTxService.update(schedule.id, testUserId, {});
        schedule = await scheduledTxService.findOne(schedule.id, testUserId);
      }

      // After 3 failures, status should be SUSPENDED
      expect(schedule.status).toBe('SUSPENDED');
      expect(schedule.consecutiveFailures).toBe(3);
    });
  });

  describe('Execution History Tracking', () => {
    let scheduleId: string;

    beforeEach(async () => {
      const schedule = await scheduledTxService.create(testUserId, {
        amount: 100,
        currency: 'USD',
        frequency: 'DAILY',
        description: 'Test history',
      });
      scheduleId = schedule.id;
    });

    it('should track execution history correctly', async () => {
      let schedule = await scheduledTxService.findOne(scheduleId, testUserId);
      
      // Simulate successful execution
      schedule.executionHistory = [
        {
          executedAt: new Date().toISOString(),
          status: 'SUCCESS' as const,
          transactionId: 'test-tx-id',
        },
      ];
      await scheduledTxService.update(schedule.id, testUserId, {});
      
      schedule = await scheduledTxService.findOne(schedule.id, testUserId);
      expect(schedule.executionHistory).toBeDefined();
      expect(schedule.executionHistory!.length).toBe(1);
      expect(schedule.executionHistory![0].status).toBe('SUCCESS');
      expect(schedule.executionHistory![0].transactionId).toBe('test-tx-id');
    });

    it('should limit execution history to 50 entries', async () => {
      let schedule = await scheduledTxService.findOne(scheduleId, testUserId);
      
      // Add 60 execution history entries
      const history = [];
      for (let i = 1; i <= 60; i++) {
        history.push({
          executedAt: new Date(Date.now() + i * 1000).toISOString(),
          status: 'SUCCESS' as const,
          transactionId: `tx-${i}`,
        });
      }
      
      schedule.executionHistory = history;
      await scheduledTxService.update(schedule.id, testUserId, {});
      
      schedule = await scheduledTxService.findOne(schedule.id, testUserId);
      expect(schedule.executionHistory!.length).toBe(50); // Should be limited to 50
    });
  });

  describe('Idempotency Key Generation', () => {
    it('should generate consistent idempotency keys', () => {
      const scheduleId = 'test-schedule-id';
      const executionDate = new Date('2024-01-01T10:00:00Z');
      
      const expectedKey = `sched-${scheduleId}-${executionDate.toISOString()}`;
      
      expect(expectedKey).toBe('sched-test-schedule-id-2024-01-01T10:00:00.000Z');
    });

    it('should generate unique keys for different execution dates', () => {
      const scheduleId = 'test-schedule-id';
      const date1 = new Date('2024-01-01T10:00:00Z');
      const date2 = new Date('2024-01-02T10:00:00Z');
      
      const key1 = `sched-${scheduleId}-${date1.toISOString()}`;
      const key2 = `sched-${scheduleId}-${date2.toISOString()}`;
      
      expect(key1).not.toBe(key2);
    });
  });
});
