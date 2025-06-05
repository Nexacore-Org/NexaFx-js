import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';

describe('HMAC Data Integrity Tests', () => {
  let app: INestApplication;
  let hmacService: HmacService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '.env.test',
        }),
        HmacIntegrityModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    hmacService = moduleFixture.get<HmacService>(HmacService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Valid HMAC Signatures', () => {
    it('should accept valid HMAC signature for POST request', async () => {
      const payload = { userId: 123, amount: 100.50, currency: 'USD', timestamp: '2025-01-01T00:00:00Z' };
      const payloadString = JSON.stringify(payload);
      const signature = hmacService.generateSignature(payloadString);

      const response = await request(app.getHttpServer())
        .post('/api/critical-operation')
        .set('x-signature', signature)
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(123);
    });

    it('should accept valid HMAC signature for GET request', async () => {
      const queryParams = 'userId=456';
      const signature = hmacService.generateSignature(queryParams);

      const response = await request(app.getHttpServer())
        .get('/api/secure-data?userId=456')
        .set('x-signature', signature)
        .expect(200);

      expect(response.body.userId).toBe('456');
    });

    it('should handle different signature header formats', async () => {
      const payload = { event: 'user.created', data: { id: 1 }, timestamp: Date.now() };
      const payloadString = JSON.stringify(payload);
      const signature = hmacService.generateSignature(payloadString);

      // Test with sha256= prefix
      await request(app.getHttpServer())
        .post('/api/webhook')
        .set('x-hub-signature-256', `sha256=${signature}`)
        .send(payload)
        .expect(201);

      // Test with different header name
      await request(app.getHttpServer())
        .post('/api/webhook')
        .set('x-hmac-signature', signature)
        .send(payload)
        .expect(201);
    });
  });

  describe('Invalid HMAC Signatures', () => {
    it('should reject tampered payload', async () => {
      const originalPayload = { userId: 123, amount: 100.50, currency: 'USD' };
      const tamperedPayload = { userId: 123, amount: 999.99, currency: 'USD' }; // Amount changed
      
      const signature = hmacService.generateSignature(JSON.stringify(originalPayload));

      await request(app.getHttpServer())
        .post('/api/critical-operation')
        .set('x-signature', signature)
        .send(tamperedPayload)
        .expect(401);
    });

    it('should reject invalid signature format', async () => {
      const payload = { userId: 123, amount: 100.50, currency: 'USD' };

      await request(app.getHttpServer())
        .post('/api/critical-operation')
        .set('x-signature', 'invalid-signature')
        .send(payload)
        .expect(401);
    });

    it('should reject missing signature', async () => {
      const payload = { userId: 123, amount: 100.50, currency: 'USD' };

      await request(app.getHttpServer())
        .post('/api/critical-operation')
        .send(payload)
        .expect(400);
    });

    it('should reject empty payload with signature', async () => {
      const signature = hmacService.generateSignature('{}');

      await request(app.getHttpServer())
        .post('/api/critical-operation')
        .set('x-signature', signature)
        .expect(400);
    });
  });

  describe('Non-HMAC Protected Endpoints', () => {
    it('should allow access to regular endpoints without HMAC', async () => {
      const payload = { data: 'test' };

      const response = await request(app.getHttpServer())
        .post('/api/regular-operation')
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('HMAC Service Unit Tests', () => {
    it('should generate consistent signatures', () => {
      const payload = 'test-payload';
      const sig1 = hmacService.generateSignature(payload);
      const sig2 = hmacService.generateSignature(payload);
      
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex string
    });

    it('should verify valid signatures', () => {
      const payload = 'test-payload';
      const signature = hmacService.generateSignature(payload);
      
      expect(hmacService.verifySignature(payload, signature)).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const payload = 'test-payload';
      const wrongSignature = 'wrong-signature';
      
      expect(hmacService.verifySignature(payload, wrongSignature)).toBe(false);
    });

    it('should extract signatures from different formats', () => {
      const signature = 'abc123defacb';
      
      expect(hmacService.extractSignature(signature)).toBe(signature);
      expect(hmacService.extractSignature(`sha256=${signature}`)).toBe(signature);
      expect(hmacService.extractSignature('invalid')).toBe('invalid');
      expect(hmacService.extractSignature(null)).toBe(null);
    });
  });
});
