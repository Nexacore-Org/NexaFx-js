import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FxConversion, ConversionStatus } from '../src/fx/entities/fx-conversion.entity';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { WalletEntity } from '../src/modules/users/entities/wallet.entity';

async function loginAs(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'TestPass123!' })
    .expect(200);
  return res.body.access_token;
}

describe('FX Reversal (e2e)', () => {
  let app: INestApplication;
  let conversionRepo: Repository<FxConversion>;
  let txRepo: Repository<TransactionEntity>;
  let walletRepo: Repository<WalletEntity>;
  let aliceToken: string;
  let adminToken: string;
  let aliceId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    conversionRepo = module.get(getRepositoryToken(FxConversion));
    txRepo = module.get(getRepositoryToken(TransactionEntity));
    walletRepo = module.get(getRepositoryToken(WalletEntity));

    aliceToken = await loginAs(app, 'alice@test.nexafx.io');
    adminToken = await loginAs(app, 'admin@test.nexafx.io');

    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    aliceId = me.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /fx/convert/:id/reverse', () => {
    let testConversion: FxConversion;

    beforeEach(async () => {
      // Create a fresh conversion for Alice
      const quoteRes = await request(app.getHttpServer())
        .get('/fx/convert/quote')
        .set('Authorization', `Bearer ${aliceToken}`)
        .query({ fromCurrency: 'USD', toCurrency: 'NGN', fromAmount: 10000 })
        .expect(200);

      const execRes = await request(app.getHttpServer())
        .post('/fx/convert')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ quoteId: quoteRes.body.id })
        .expect(201);
      
      testConversion = execRes.body;
    });

    it('successfully reverses a conversion within 5 minutes', async () => {
      const res = await request(app.getHttpServer())
        .post(`/fx/convert/${testConversion.id}/reverse`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ reason: 'Accidental conversion' })
        .expect(200);

      expect(res.body.status).toBe(ConversionStatus.REVERSED);
      expect(res.body.reversalReason).toBe('Accidental conversion');

      // Verify transactions
      const txs = await txRepo.find({
        where: { metadata: { conversionId: testConversion.id } } as any,
      });
      expect(txs.length).toBeGreaterThanOrEqual(2);
      expect(txs.some(t => t.direction === 'CREDIT' && t.currency === 'USD')).toBe(true);
      expect(txs.some(t => t.direction === 'DEBIT' && t.currency === 'NGN')).toBe(true);
    });

    it('blocks reversal after 5 minutes and provides dispute link', async () => {
      // Backdate the conversion
      const oldDate = new Date();
      oldDate.setMinutes(oldDate.getMinutes() - 10);
      await conversionRepo.update(testConversion.id, { createdAt: oldDate });

      const res = await request(app.getHttpServer())
        .post(`/fx/convert/${testConversion.id}/reverse`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ reason: 'Late reversal' })
        .expect(409);

      expect(res.body.message).toContain('Reversal window has passed');
      expect(res.body.disputeLink).toBe(`/fx/convert/${testConversion.id}/dispute`);
    });

    it('prevents concurrent reversal attempts', async () => {
      // Send two requests almost simultaneously
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/fx/convert/${testConversion.id}/reverse`)
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ reason: 'Attempt 1' }),
        request(app.getHttpServer())
          .post(`/fx/convert/${testConversion.id}/reverse`)
          .set('Authorization', `Bearer ${aliceToken}`)
          .send({ reason: 'Attempt 2' }),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);
    });
  });

  describe('Admin Audit Trail', () => {
    it('GET /admin/fx/reversals shows reversed transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/fx/reversals')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((c: any) => c.status === 'REVERSED')).toBe(true);
    });
  });
});
