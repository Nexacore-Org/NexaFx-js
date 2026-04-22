import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { DisputeEntity } from '../src/modules/disputes/entities/dispute.entity';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';

describe('Disputes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let adminToken: string;
  let transactionId: string;
  let disputeId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);

    // Clean up
    await dataSource.getRepository(DisputeEntity).delete({});
    await dataSource.getRepository(TransactionEntity).delete({});

    // Create test user and admin tokens (mock)
    userToken = 'mock-user-token';
    adminToken = 'mock-admin-token';
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /transactions/:id/dispute - should open dispute', async () => {
    // First create a transaction
    const createTxResponse = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 100,
        currency: 'USD',
        description: 'Test transaction',
        walletId: 'test-wallet-id',
      });

    transactionId = createTxResponse.body.data.id;

    const response = await request(app.getHttpServer())
      .post(`/transactions/${transactionId}/dispute`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        reason: 'Unauthorized transaction',
        evidenceFileIds: ['file1', 'file2'],
      });

    expect(response.status).toBe(201);
    expect(response.body.subjectType).toBe('TRANSACTION');
    expect(response.body.status).toBe('OPEN');
    expect(response.body.reason).toBe('Unauthorized transaction');

    disputeId = response.body.id;
  });

  it('GET /disputes - should return user disputes', async () => {
    const response = await request(app.getHttpServer())
      .get('/disputes')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('GET /disputes/:id - should return specific dispute', async () => {
    const response = await request(app.getHttpServer())
      .get(`/disputes/${disputeId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(disputeId);
  });

  it('PATCH /admin/disputes/:id/review - should mark as under review', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/disputes/${disputeId}/review`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('UNDER_REVIEW');
  });

  it('PATCH /admin/disputes/:id - should resolve dispute', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/disputes/${disputeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'RESOLVED',
        resolutionNote: 'Transaction verified as legitimate',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('RESOLVED');
    expect(response.body.resolutionNote).toBe('Transaction verified as legitimate');
  });

  it('should prevent duplicate open disputes', async () => {
    const response = await request(app.getHttpServer())
      .post(`/transactions/${transactionId}/dispute`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        reason: 'Another dispute',
      });

    expect(response.status).toBe(409); // Conflict
  });
});