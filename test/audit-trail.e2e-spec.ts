import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditModule } from '../src/modules/admin-audit/admin-audit.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { AdminAuditLogEntity, ActorType } from '../src/modules/admin-audit/entities/admin-audit-log.entity';
import { AuditTrailInterceptor } from '../src/modules/admin-audit/interceptors/audit-trail.interceptor';
import { AdminAuditService, AuditContext } from '../src/modules/admin-audit/admin-audit.service';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

describe('Audit Trail E2E Tests', () => {
  let app: INestApplication;
  let auditService: AdminAuditService;
  let auditRepository: Repository<AdminAuditLogEntity>;
  let adminToken: string = '';
  let userToken: string = '';
  let testUserId: string = '';
  let testAdminId: string = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [AdminAuditLogEntity],
          synchronize: true,
          logging: false,
        }),
        AdminAuditModule,
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Apply the audit interceptor globally for testing
    app.useGlobalInterceptors(new AuditTrailInterceptor(
      moduleFixture.get<AdminAuditService>(AdminAuditService),
      moduleFixture.get('Reflector'),
    ));

    await app.init();

    auditService = moduleFixture.get<AdminAuditService>(AdminAuditService);
    auditRepository = moduleFixture.get<Repository<AdminAuditLogEntity>>(
      'AdminAuditLogEntityRepository',
    );

    // Create test users and get tokens
    await setupTestUsers();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear audit logs before each test
    await auditRepository.clear();
  });

  describe('Auth Events Audit Logging', () => {
    it('should log successful login', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      };

      // Simulate login through auth service
      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        email: 'test@example.com',
        action: 'LOGIN',
        success: true,
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.action).toBe('LOGIN');
      expect(log.entity).toBe('User');
      expect(log.entityId).toBe(testUserId);
      expect(log.actorId).toBe(testUserId);
      expect(log.actorType).toBe(ActorType.USER);
      expect(log.description).toBe('User logged in successfully');
      expect(log.ip).toBe('127.0.0.1');
      expect(log.userAgent).toBe('test-agent');
    });

    it('should log failed login attempts', async () => {
      const auditContext: AuditContext = {
        actorId: 'unknown',
        actorType: ActorType.USER,
        ip: '192.168.1.100',
        userAgent: 'malicious-agent',
      };

      await auditService.logAuthEvent(auditContext, {
        userId: 'nonexistent-user',
        email: 'fake@example.com',
        action: 'LOGIN_FAILED',
        success: false,
        reason: 'Invalid credentials',
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.action).toBe('LOGIN_FAILED');
      expect(log.description).toBe('Login failed: Invalid credentials');
      expect(log.metadata.success).toBe(false);
      expect(log.metadata.reason).toBe('Invalid credentials');
    });

    it('should log logout events', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        action: 'LOGOUT',
        success: true,
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('LOGOUT');
      expect(logs[0].description).toBe('User logged out');
    });

    it('should log password reset events', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        email: 'test@example.com',
        action: 'PASSWORD_RESET',
        success: true,
      });

      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        action: 'PASSWORD_RESET_COMPLETED',
        success: true,
      });

      const logs = await auditRepository.find({ order: { createdAt: 'ASC' } });
      expect(logs).toHaveLength(2);
      expect(logs[0].action).toBe('PASSWORD_RESET');
      expect(logs[1].action).toBe('PASSWORD_RESET_COMPLETED');
    });

    it('should log 2FA events', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        action: '2FA_ENABLED',
        success: true,
      });

      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        action: '2FA_DISABLED',
        success: true,
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(2);
      expect(logs[0].action).toBe('2FA_ENABLED');
      expect(logs[1].action).toBe('2FA_DISABLED');
    });
  });

  describe('Financial Events Audit Logging', () => {
    it('should log transaction creation', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      const transactionId = crypto.randomUUID();
      const beforeSnapshot = { balance: 1000 };
      const afterSnapshot = { balance: 900, transactionId };

      await auditService.logFinancialEvent(auditContext, {
        userId: testUserId,
        action: 'TRANSACTION_CREATED',
        entityId: transactionId,
        entityType: 'Transaction',
        amount: 100,
        currency: 'USD',
        beforeSnapshot,
        afterSnapshot,
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.action).toBe('TRANSACTION_CREATED');
      expect(log.entity).toBe('Transaction');
      expect(log.entityId).toBe(transactionId);
      expect(log.description).toBe('Transaction created: 100 USD');
      expect(log.beforeSnapshot).toEqual(beforeSnapshot);
      expect(log.afterSnapshot).toEqual(afterSnapshot);
      expect(log.metadata.amount).toBe(100);
      expect(log.metadata.currency).toBe('USD');
    });

    it('should log transaction reversals', async () => {
      const auditContext: AuditContext = {
        actorId: testAdminId,
        actorType: ActorType.ADMIN,
        ip: '127.0.0.1',
      };

      const transactionId = crypto.randomUUID();
      await auditService.logFinancialEvent(auditContext, {
        userId: testUserId,
        action: 'TRANSACTION_REVERSED',
        entityId: transactionId,
        entityType: 'Transaction',
        amount: 50,
        currency: 'EUR',
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('TRANSACTION_REVERSED');
      expect(logs[0].description).toBe('Transaction reversed: 50 EUR');
      expect(logs[0].actorType).toBe(ActorType.ADMIN);
    });

    it('should log FX conversions', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      const conversionId = crypto.randomUUID();
      await auditService.logFinancialEvent(auditContext, {
        userId: testUserId,
        action: 'FX_CONVERSION',
        entityId: conversionId,
        entityType: 'FXConversion',
        amount: 1000,
        currency: 'USD',
        metadata: {
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          rate: 0.85,
          convertedAmount: 850,
        },
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('FX_CONVERSION');
      expect(logs[0].entity).toBe('FXConversion');
      expect(logs[0].metadata.fromCurrency).toBe('USD');
      expect(logs[0].metadata.toCurrency).toBe('EUR');
      expect(logs[0].metadata.rate).toBe(0.85);
    });

    it('should log wallet debits and credits', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      const walletId = crypto.randomUUID();
      
      await auditService.logFinancialEvent(auditContext, {
        userId: testUserId,
        action: 'WALLET_DEBIT',
        entityId: walletId,
        entityType: 'Wallet',
        amount: 25,
        currency: 'USD',
      });

      await auditService.logFinancialEvent(auditContext, {
        userId: testUserId,
        action: 'WALLET_CREDIT',
        entityId: walletId,
        entityType: 'Wallet',
        amount: 10,
        currency: 'USD',
      });

      const logs = await auditRepository.find({ order: { createdAt: 'ASC' } });
      expect(logs).toHaveLength(2);
      expect(logs[0].action).toBe('WALLET_DEBIT');
      expect(logs[0].description).toBe('Wallet debited: 25 USD');
      expect(logs[1].action).toBe('WALLET_CREDIT');
      expect(logs[1].description).toBe('Wallet credited: 10 USD');
    });
  });

  describe('Admin Actions Audit Logging', () => {
    it('should log admin actions with proper context', async () => {
      const auditContext: AuditContext = {
        actorId: testAdminId,
        actorType: ActorType.ADMIN,
        ip: '127.0.0.1',
        userAgent: 'admin-dashboard',
      };

      await auditService.logAdminAction(auditContext, {
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: testUserId,
        description: 'User account suspended due to policy violation',
        beforeSnapshot: { status: 'active' },
        afterSnapshot: { status: 'suspended' },
        metadata: { reason: 'Policy violation', suspendedBy: testAdminId },
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.action).toBe('USER_SUSPENDED');
      expect(log.entity).toBe('User');
      expect(log.entityId).toBe(testUserId);
      expect(log.actorType).toBe(ActorType.ADMIN);
      expect(log.description).toBe('User account suspended due to policy violation');
      expect(log.beforeSnapshot).toEqual({ status: 'active' });
      expect(log.afterSnapshot).toEqual({ status: 'suspended' });
    });

    it('should log system events', async () => {
      await auditService.logSystemEvent(
        'DATA_PURGE',
        'Transaction',
        'Scheduled data purge completed',
        { recordsPurged: 1000, duration: '2.5s' },
      );

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.action).toBe('DATA_PURGE');
      expect(log.entity).toBe('Transaction');
      expect(log.actorType).toBe(ActorType.SYSTEM);
      expect(log.actorId).toBe('system');
      expect(log.description).toBe('Scheduled data purge completed');
      expect(log.metadata.recordsPurged).toBe(1000);
    });
  });

  describe('Audit Query and Filtering', () => {
    beforeEach(async () => {
      // Create test data for filtering tests
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      // Create various audit logs
      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        action: 'LOGIN',
        success: true,
      });

      await auditService.logFinancialEvent(auditContext, {
        userId: testUserId,
        action: 'TRANSACTION_CREATED',
        entityId: 'tx-123',
        entityType: 'Transaction',
        amount: 100,
        currency: 'USD',
      });

      const adminContext: AuditContext = {
        actorId: testAdminId,
        actorType: ActorType.ADMIN,
        ip: '127.0.0.1',
      };

      await auditService.logAdminAction(adminContext, {
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: testUserId,
      });
    });

    it('should filter logs by actor', async () => {
      const userLogs = await auditService.findByActor(testUserId);
      expect(userLogs).toHaveLength(2); // LOGIN and TRANSACTION_CREATED

      const adminLogs = await auditService.findByActor(testAdminId);
      expect(adminLogs).toHaveLength(1); // USER_UPDATED
    });

    it('should filter logs by entity', async () => {
      const userLogs = await auditService.findByEntity('User', testUserId);
      expect(userLogs).toHaveLength(2); // LOGIN and USER_UPDATED

      const transactionLogs = await auditService.findByEntity('Transaction', 'tx-123');
      expect(transactionLogs).toHaveLength(1); // TRANSACTION_CREATED
    });

    it('should search logs by query', async () => {
      const loginResults = await auditService.search('LOGIN');
      expect(loginResults.length).toBeGreaterThan(0);
      expect(loginResults[0].action).toBe('LOGIN');

      const transactionResults = await auditService.search('TRANSACTION');
      expect(transactionResults.length).toBeGreaterThan(0);
      expect(transactionResults[0].entity).toBe('Transaction');
    });

    it('should return paginated results', async () => {
      const results = await auditService.findAll({ limit: 2, offset: 0 });
      expect(results.items).toHaveLength(2);
      expect(results.total).toBeGreaterThan(0);
      expect(results.limit).toBe(2);
      expect(results.offset).toBe(0);

      const page2 = await auditService.findAll({ limit: 2, offset: 2 });
      expect(page2.items.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Audit Log Immutability', () => {
    it('should prevent audit log updates', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        action: 'LOGIN',
        success: true,
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);

      const log = logs[0];
      
      // Try to update the log (this should fail at the database level)
      try {
        await auditRepository.update(log.id, { description: 'Modified description' });
        // If we get here, the update succeeded (which shouldn't happen with proper constraints)
        // But we can still verify the content hasn't changed
        const updatedLog = await auditRepository.findOne({ where: { id: log.id } });
        expect(updatedLog?.description).toBe('User logged in successfully');
      } catch (error: any) {
        // This is expected - the database constraint should prevent updates
        const errorMessage = error.message || '';
        const hasUpdateError = errorMessage.includes('cannot be updated');
        const hasImmutableError = errorMessage.includes('immutable');
        const hasReadOnlyError = errorMessage.includes('read-only');
        expect(hasUpdateError || hasImmutableError || hasReadOnlyError).toBe(true);
      }
    });

    it('should prevent audit log deletion', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      await auditService.logAuthEvent(auditContext, {
        userId: testUserId,
        action: 'LOGIN',
        success: true,
      });

      const logs = await auditRepository.find();
      expect(logs).toHaveLength(1);

      // Try to delete the log (this should fail at the database level)
      try {
        await auditRepository.delete(logs[0].id);
        // If we get here, check if the record still exists
        const remainingLogs = await auditRepository.find();
        expect(remainingLogs).toHaveLength(1);
      } catch (error: any) {
        // This is expected - the database constraint should prevent deletion
        const errorMessage = error.message || '';
        const hasDeleteError = errorMessage.includes('cannot be deleted');
        const hasImmutableError = errorMessage.includes('immutable');
        const hasReadOnlyError = errorMessage.includes('read-only');
        expect(hasDeleteError || hasImmutableError || hasReadOnlyError).toBe(true);
      }
    });
  });

  describe('Concurrent Audit Logging', () => {
    it('should handle concurrent audit logging without blocking', async () => {
      const auditContext: AuditContext = {
        actorId: testUserId,
        actorType: ActorType.USER,
        ip: '127.0.0.1',
      };

      // Create multiple audit events concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        auditService.logAuthEvent(auditContext, {
          userId: testUserId,
          action: 'LOGIN',
          success: true,
          metadata: { attempt: i + 1 },
        }),
      );

      await Promise.all(promises);

      const logs = await auditRepository.find({ order: { createdAt: 'ASC' } });
      expect(logs).toHaveLength(10);
      
      // Verify all logs were created
      logs.forEach((log, index) => {
        expect(log.action).toBe('LOGIN');
        expect(log.metadata.attempt).toBe(index + 1);
      });
    });
  });

  async function setupTestUsers() {
    // This would normally involve creating actual users through the user service
    // For testing purposes, we'll use mock IDs
    testUserId = crypto.randomUUID();
    testAdminId = crypto.randomUUID();
    
    // In a real test, you would:
    // 1. Create a test user
    // 2. Create a test admin
    // 3. Get JWT tokens for both
    // 4. Store the tokens for use in API tests
    
    // For now, we'll simulate the tokens
    adminToken = 'mock-admin-jwt-token';
    userToken = 'mock-user-jwt-token';
  }
});
