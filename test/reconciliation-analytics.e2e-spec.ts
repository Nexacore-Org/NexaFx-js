import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReconciliationIssueEntity } from '../src/modules/reconciliation/entities/reconciliation-issue.entity';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { AdminAuditService } from '../src/modules/admin-audit/admin-audit.service';
import { AlertingService } from '../src/modules/risk-engine/services/alerting.service';

describe('Reconciliation Analytics (e2e)', () => {
  let app: INestApplication;

  const mockIssue = {
    id: 'issue-uuid',
    transactionId: 'tx-uuid',
    mismatchType: 'PROVIDER_MISMATCH',
    status: 'ESCALATED',
    createdAt: new Date(),
  };

  const mockTx = {
    id: 'tx-uuid',
    status: 'PENDING',
    amount: 100,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRepositoryToken(ReconciliationIssueEntity))
      .useValue({
        count: jest.fn().mockResolvedValue(10),
        find: jest.fn().mockResolvedValue([mockIssue]),
        findOne: jest.fn().mockResolvedValue(mockIssue),
        save: jest.fn().mockResolvedValue({ ...mockIssue, status: 'AUTO_RESOLVED' }),
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([{ type: 'PROVIDER_MISMATCH', count: 5 }, { day: new Date(), count: 2 }]),
          getManyAndCount: jest.fn().mockResolvedValue([[mockIssue], 1]),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
        }),
      })
      .overrideProvider(getRepositoryToken(TransactionEntity))
      .useValue({
        count: jest.fn().mockResolvedValue(100),
      })
      .overrideProvider(AdminAuditService)
      .useValue({
        logAdminAction: jest.fn().mockResolvedValue(null),
      })
      .overrideProvider(AlertingService)
      .useValue({
        sendReconciliationAlert: jest.fn().mockResolvedValue(null),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/analytics/reconciliation', () => {
    it('should return reconciliation summary metrics', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/analytics/reconciliation')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body).toHaveProperty('mismatchRate');
      expect(response.body).toHaveProperty('autoResolutionRate');
      expect(response.body).toHaveProperty('escalationBacklog');
      expect(response.body).toHaveProperty('timeSeries');
    });
  });

  describe('GET /admin/reconciliation/issues', () => {
    it('should support filtering by status and mismatchType', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/reconciliation/issues?status=ESCALATED&mismatchType=PROVIDER_MISMATCH')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('PATCH /admin/reconciliation/issues/:id/resolve', () => {
    it('should resolve issue and log audit entry', async () => {
      const response = await request(app.getHttpServer())
        .patch('/admin/reconciliation/issues/issue-uuid/resolve')
        .set('Authorization', 'Bearer admin-token')
        .send({ resolution: 'Verified with provider dashboard' })
        .expect(200);

      expect(response.body.status).toBe('AUTO_RESOLVED');
      expect(response.body.resolution).toContain('Manual resolution');
    });
  });
});
