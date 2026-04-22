import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { TransactionNoteEntity } from '../src/modules/transactions/entities/transaction-note.entity';
import { TransactionTagEntity } from '../src/modules/transactions/entities/transaction-tag.entity';
import { TransactionAnnotationService } from '../src/modules/transactions/services/transaction-annotation.service';
import { TransactionsService } from '../src/modules/transactions/services/transactions.service';
import * as request from 'supertest';

describe('Transaction Annotations (e2e)', () => {
  let app: INestApplication;
  let annotationService: TransactionAnnotationService;
  let transactionsService: TransactionsService;
  let testTransaction: TransactionEntity;
  let testUserId = 'test-user-id';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [TransactionEntity, TransactionNoteEntity, TransactionTagEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([TransactionEntity, TransactionNoteEntity, TransactionTagEntity]),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    annotationService = moduleFixture.get<TransactionAnnotationService>(TransactionAnnotationService);
    transactionsService = moduleFixture.get<TransactionsService>(TransactionsService);
    
    await app.init();

    // Create a test transaction
    testTransaction = await transactionsService.createTransaction({
      amount: 100,
      currency: 'USD',
      description: 'Test transaction',
      walletId: 'test-wallet-id',
      toAddress: '0x1234567890123456789012345678901234567890',
      fromAddress: '0x0987654321098765432109876543210987654321',
    }, {
      actorId: testUserId,
      actorType: 'USER',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /transactions/:id/notes', () => {
    it('should add a note to a transaction', async () => {
      const noteContent = 'This is a test note';
      
      const response = await request(app.getHttpServer())
        .post(`/transactions/${testTransaction.id}/notes`)
        .send({ content: noteContent })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(noteContent);
      expect(response.body.data.transactionId).toBe(testTransaction.id);
      expect(response.body.data.userId).toBe(testUserId);
    });

    it('should return 404 for non-existent transaction', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      await request(app.getHttpServer())
        .post(`/transactions/${fakeId}/notes`)
        .send({ content: 'Test note' })
        .expect(404);
    });

    it('should validate note content', async () => {
      await request(app.getHttpServer())
        .post(`/transactions/${testTransaction.id}/notes`)
        .send({ content: '' })
        .expect(400);
    });
  });

  describe('POST /transactions/:id/tags', () => {
    it('should add a tag to a transaction', async () => {
      const tagName = 'groceries';
      
      const response = await request(app.getHttpServer())
        .post(`/transactions/${testTransaction.id}/tags`)
        .send({ tag: tagName })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tag).toBe(tagName.toLowerCase()); // Should be normalized
      expect(response.body.data.transactionId).toBe(testTransaction.id);
      expect(response.body.data.userId).toBe(testUserId);
    });

    it('should normalize tag to lowercase', async () => {
      const tagName = 'GROCERIES';
      
      const response = await request(app.getHttpServer())
        .post(`/transactions/${testTransaction.id}/tags`)
        .send({ tag: tagName })
        .expect(201);

      expect(response.body.data.tag).toBe('groceries');
    });

    it('should not duplicate tags', async () => {
      const tagName = 'groceries';
      
      // Add tag first time
      await request(app.getHttpServer())
        .post(`/transactions/${testTransaction.id}/tags`)
        .send({ tag: tagName })
        .expect(201);

      // Add same tag second time
      const response = await request(app.getHttpServer())
        .post(`/transactions/${testTransaction.id}/tags`)
        .send({ tag: tagName })
        .expect(201);

      expect(response.body.data.tag).toBe(tagName);
    });
  });

  describe('DELETE /transactions/:id/tags/:tag', () => {
    it('should remove a tag from a transaction', async () => {
      const tagName = 'removable-tag';
      
      // Add tag first
      await request(app.getHttpServer())
        .post(`/transactions/${testTransaction.id}/tags`)
        .send({ tag: tagName })
        .expect(201);

      // Remove tag
      await request(app.getHttpServer())
        .delete(`/transactions/${testTransaction.id}/tags/${tagName}`)
        .expect(200);
    });

    it('should return 404 when trying to remove non-existent tag', async () => {
      const nonExistentTag = 'non-existent-tag';
      
      await request(app.getHttpServer())
        .delete(`/transactions/${testTransaction.id}/tags/${nonExistentTag}`)
        .expect(404);
    });
  });

  describe('GET /transactions/:id', () => {
    it('should get transaction with annotations', async () => {
      // Add note and tag first
      await annotationService.addNote(testTransaction.id, testUserId, 'Test note for retrieval');
      await annotationService.addTag(testTransaction.id, testUserId, 'test-tag');

      const response = await request(app.getHttpServer())
        .get(`/transactions/${testTransaction.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notes).toBeDefined();
      expect(response.body.data.tags).toBeDefined();
      expect(response.body.data.notes.length).toBeGreaterThan(0);
      expect(response.body.data.tags.length).toBeGreaterThan(0);
    });
  });

  describe('GET /transactions/search/tag', () => {
    it('should search transactions by tag', async () => {
      const tagName = 'search-test-tag';
      
      // Add tag to test transaction
      await annotationService.addTag(testTransaction.id, testUserId, tagName);

      const response = await request(app.getHttpServer())
        .get('/transactions/search/tag')
        .query({ tag: tagName })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions).toBeDefined();
      expect(response.body.data.total).toBeDefined();
      expect(response.body.data.total).toBeGreaterThan(0);
    });
  });

  describe('GET /transactions/search/notes', () => {
    it('should search transactions by note content', async () => {
      const noteContent = 'special search term';
      
      // Add note to test transaction
      await annotationService.addNote(testTransaction.id, testUserId, noteContent);

      const response = await request(app.getHttpServer())
        .get('/transactions/search/notes')
        .query({ notes: 'special' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions).toBeDefined();
      expect(response.body.data.total).toBeDefined();
      expect(response.body.data.total).toBeGreaterThan(0);
    });
  });

  describe('GET /transactions/tags', () => {
    it('should get all user tags with usage count', async () => {
      // Add some tags
      await annotationService.addTag(testTransaction.id, testUserId, 'tag1');
      await annotationService.addTag(testTransaction.id, testUserId, 'tag2');
      await annotationService.addTag(testTransaction.id, testUserId, 'tag3');

      const response = await request(app.getHttpServer())
        .get('/transactions/tags')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      
      if (response.body.data.length > 0) {
        const tag = response.body.data[0];
        expect(tag).toHaveProperty('tag');
        expect(tag).toHaveProperty('count');
        expect(typeof tag.count).toBe('number');
      }
    });
  });

  describe('POST /transactions/bulk-tag', () => {
    it('should apply tag to multiple transactions', async () => {
      // Create another test transaction
      const secondTransaction = await transactionsService.createTransaction({
        amount: 50,
        currency: 'USD',
        description: 'Second test transaction',
        walletId: 'test-wallet-id',
        toAddress: '0x1234567890123456789012345678901234567890',
        fromAddress: '0x0987654321098765432109876543210987654321',
      }, {
        actorId: testUserId,
        actorType: 'USER',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      const response = await request(app.getHttpServer())
        .post('/transactions/bulk-tag')
        .send({
          tag: 'bulk-test-tag',
          filter: { currency: 'USD' },
          maxTransactions: 10
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tagged');
      expect(response.body.data).toHaveProperty('skipped');
      expect(typeof response.body.data.tagged).toBe('number');
      expect(typeof response.body.data.skipped).toBe('number');
    });
  });

  describe('GET /transactions/analytics/tags', () => {
    it('should get tag analytics', async () => {
      // Add some tags with transactions
      await annotationService.addTag(testTransaction.id, testUserId, 'analytics-tag');

      const response = await request(app.getHttpServer())
        .get('/transactions/analytics/tags')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      
      if (response.body.data.length > 0) {
        const analytics = response.body.data[0];
        expect(analytics).toHaveProperty('tag');
        expect(analytics).toHaveProperty('totalAmount');
        expect(analytics).toHaveProperty('transactionCount');
        expect(typeof analytics.totalAmount).toBe('number');
        expect(typeof analytics.transactionCount).toBe('number');
      }
    });

    it('should support date range filtering', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
      const endDate = new Date().toISOString();

      const response = await request(app.getHttpServer())
        .get('/transactions/analytics/tags')
        .query({ startDate, endDate })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('Search integration', () => {
    it('should support tag search in main search endpoint', async () => {
      const tagName = 'integration-tag';
      await annotationService.addTag(testTransaction.id, testUserId, tagName);

      const response = await request(app.getHttpServer())
        .get('/transactions/search')
        .query({ tag: tagName })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should support notes search in main search endpoint', async () => {
      const noteContent = 'integration search term';
      await annotationService.addNote(testTransaction.id, testUserId, noteContent);

      const response = await request(app.getHttpServer())
        .get('/transactions/search')
        .query({ notes: 'integration' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });
});
