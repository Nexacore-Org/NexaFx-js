import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransactionApprovalModule } from '../approval/transaction-approval.module';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';
import { TransactionApproval, ApprovalDecision } from '../entities/transaction-approval.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

/**
 * Integration tests for Multi-Signature Approval Workflow
 *
 * These tests use an in-memory SQLite database to validate the full
 * approval workflow: partial approval, rejection, and quorum logic.
 */
describe('Multi-Signature Approval Workflow (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const makeAdmin = (id: string, role = 'admin') => ({
    id,
    email: `${id}@nexafx.com`,
    role,
  });

  const OWNER_ID = 'owner-000';
  const APPROVER_1 = makeAdmin('approver-001', 'compliance_officer');
  const APPROVER_2 = makeAdmin('approver-002', 'finance_manager');
  const APPROVER_3 = makeAdmin('approver-003', 'admin');

  // Stub auth guards — inject user via test header
  const mockGuard = (user: object) => ({
    canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = user;
      return true;
    },
  });

  async function buildApp(actingUser: object) {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Transaction, TransactionApproval],
          synchronize: true,
        }),
        TransactionApprovalModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard(actingUser))
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const application = module.createNestApplication();
    application.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await application.init();
    dataSource = module.get(DataSource);
    return application;
  }

  async function seedPendingTransaction(overrides: Partial<Transaction> = {}): Promise<Transaction> {
    const txnRepo = dataSource.getRepository(Transaction);
    return txnRepo.save(
      txnRepo.create({
        id: `txn-${Date.now()}`,
        userId: OWNER_ID,
        amount: 15000,
        currency: 'USD',
        status: TransactionStatus.PENDING_APPROVAL,
        requiresApproval: true,
        requiredApprovals: 2,
        currentApprovals: 0,
        ...overrides,
      }),
    );
  }

  afterEach(async () => {
    if (app) await app.close();
  });

  // ─── Partial Approval ────────────────────────────────────────────────────────

  describe('Partial Approval', () => {
    it('records first approval but keeps status PENDING_APPROVAL', async () => {
      app = await buildApp(APPROVER_1);
      const txn = await seedPendingTransaction();

      const res = await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/approve`)
        .send({ comment: 'First approval' })
        .expect(200);

      expect(res.body.transactionStatus).toBe(TransactionStatus.PENDING_APPROVAL);
      expect(res.body.currentApprovals).toBe(1);
      expect(res.body.requiredApprovals).toBe(2);

      const stored = await dataSource.getRepository(Transaction).findOne({
        where: { id: txn.id },
      });
      expect(stored?.currentApprovals).toBe(1);
      expect(stored?.status).toBe(TransactionStatus.PENDING_APPROVAL);
    });

    it('prevents same approver from approving twice', async () => {
      app = await buildApp(APPROVER_1);
      const txn = await seedPendingTransaction();

      // First approval
      await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/approve`)
        .send({})
        .expect(200);

      // Duplicate approval
      await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/approve`)
        .send({})
        .expect(400);
    });

    it('prevents transaction owner from approving their own transaction', async () => {
      app = await buildApp({ id: OWNER_ID, email: 'owner@nexafx.com', role: 'admin' });
      const txn = await seedPendingTransaction();

      await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/approve`)
        .send({})
        .expect(403);
    });
  });

  // ─── Approval Quorum Logic ────────────────────────────────────────────────────

  describe('Approval Quorum Logic', () => {
    it('sets status to APPROVED once quorum is reached', async () => {
      // Seed with 1 existing approval
      const txn = await seedTransactionWithApprovals(1);

      app = await buildApp(APPROVER_2);

      const res = await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/approve`)
        .send({ comment: 'Second approval — quorum reached' })
        .expect(200);

      expect(res.body.transactionStatus).toBe(TransactionStatus.APPROVED);
      expect(res.body.currentApprovals).toBe(2);
    });

    it('requires N=3 approvals for very high-value transactions (>=50k)', async () => {
      const txn = await seedPendingTransaction({
        amount: 50000,
        requiredApprovals: 3,
        currentApprovals: 2,
      });

      // Approver 2 brings it to quorum=3
      app = await buildApp(APPROVER_2);
      const res = await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/approve`)
        .send({})
        .expect(200);

      expect(res.body.transactionStatus).toBe(TransactionStatus.APPROVED);
    });

    it('returns 404 for non-existent transaction', async () => {
      app = await buildApp(APPROVER_1);

      await request(app.getHttpServer())
        .post('/transactions/00000000-0000-0000-0000-000000000000/approve')
        .send({})
        .expect(404);
    });

    it('returns 400 when approving an already-approved transaction', async () => {
      const txn = await seedPendingTransaction({ status: TransactionStatus.APPROVED });

      app = await buildApp(APPROVER_1);

      await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/approve`)
        .send({})
        .expect(400);
    });
  });

  // ─── Rejection Case ───────────────────────────────────────────────────────────

  describe('Rejection Case', () => {
    it('immediately rejects the transaction on any rejection, even with existing approvals', async () => {
      // Seed with 1 existing approval — still gets rejected
      const txn = await seedTransactionWithApprovals(1);

      app = await buildApp(APPROVER_2);

      const res = await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/reject`)
        .send({ comment: 'Suspicious counterparty' })
        .expect(200);

      expect(res.body.transactionStatus).toBe(TransactionStatus.REJECTED);
      expect(res.body.rejectionReason).toBe('Suspicious counterparty');

      const stored = await dataSource.getRepository(Transaction).findOne({
        where: { id: txn.id },
      });
      expect(stored?.status).toBe(TransactionStatus.REJECTED);
    });

    it('prevents approving a rejected transaction', async () => {
      const txn = await seedPendingTransaction({ status: TransactionStatus.REJECTED });

      app = await buildApp(APPROVER_1);

      await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/approve`)
        .send({})
        .expect(400);
    });

    it('stores rejection decision in transaction_approvals table', async () => {
      const txn = await seedPendingTransaction();

      app = await buildApp(APPROVER_1);

      await request(app.getHttpServer())
        .post(`/transactions/${txn.id}/reject`)
        .send({ comment: 'Compliance hold' })
        .expect(200);

      const approvals = await dataSource
        .getRepository(TransactionApproval)
        .find({ where: { transactionId: txn.id } });

      expect(approvals).toHaveLength(1);
      expect(approvals[0].decision).toBe(ApprovalDecision.REJECTED);
      expect(approvals[0].approverId).toBe(APPROVER_1.id);
    });
  });

  // ─── Approval History Endpoint ────────────────────────────────────────────────

  describe('GET /transactions/:id/approvals', () => {
    it('returns approval history for a transaction', async () => {
      const txn = await seedTransactionWithApprovals(2);

      app = await buildApp(APPROVER_1);

      const res = await request(app.getHttpServer())
        .get(`/transactions/${txn.id}/approvals`)
        .expect(200);

      expect(res.body.transactionId).toBe(txn.id);
      expect(res.body.approvals).toHaveLength(2);
    });
  });

  // ─── Pending Approvals List ───────────────────────────────────────────────────

  describe('GET /transactions/pending-approvals', () => {
    it('returns all transactions pending approval', async () => {
      await seedPendingTransaction();
      await seedPendingTransaction();
      await seedPendingTransaction({ status: TransactionStatus.APPROVED });

      app = await buildApp(APPROVER_1);

      const res = await request(app.getHttpServer())
        .get('/transactions/pending-approvals')
        .expect(200);

      expect(res.body.count).toBe(2);
      expect(res.body.transactions).toHaveLength(2);
    });
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  async function seedTransactionWithApprovals(
    approvalCount: number,
  ): Promise<Transaction> {
    const txnRepo = dataSource.getRepository(Transaction);
    const approvalRepo = dataSource.getRepository(TransactionApproval);

    const txn = await txnRepo.save(
      txnRepo.create({
        id: `txn-${Date.now()}`,
        userId: OWNER_ID,
        amount: 15000,
        currency: 'USD',
        status: TransactionStatus.PENDING_APPROVAL,
        requiresApproval: true,
        requiredApprovals: 2,
        currentApprovals: approvalCount,
      }),
    );

    const approvers = [APPROVER_1, APPROVER_2, APPROVER_3];
    for (let i = 0; i < approvalCount; i++) {
      await approvalRepo.save(
        approvalRepo.create({
          transactionId: txn.id,
          approverId: approvers[i].id,
          approverEmail: approvers[i].email,
          approverRole: approvers[i].role,
          decision: ApprovalDecision.APPROVED,
        }),
      );
    }

    return txn;
  }
});
