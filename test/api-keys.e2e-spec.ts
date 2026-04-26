import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiKeysModule } from '../src/modules/api-keys/api-keys.module';
import { ApiKeyEntity } from '../src/modules/api-keys/entities/api-key.entity';
import { ApiKeyUsageLogEntity } from '../src/modules/api-keys/entities/api-key-usage-log.entity';
import { Repository } from 'typeorm';

describe('API Keys (e2e)', () => {
  let app: INestApplication;
  let apiKeyRepo: Repository<ApiKeyEntity>;
  let usageLogRepo: Repository<ApiKeyUsageLogEntity>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiKeysModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    apiKeyRepo = moduleFixture.get<Repository<ApiKeyEntity>>(getRepositoryToken(ApiKeyEntity));
    usageLogRepo = moduleFixture.get<Repository<ApiKeyUsageLogEntity>>(getRepositoryToken(ApiKeyUsageLogEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await usageLogRepo.clear();
    await apiKeyRepo.clear();
  });

  describe('POST /admin/api-keys', () => {
    it('should generate a new API key and return plaintext once', async () => {
      const dto = {
        name: 'Test Key',
        scopes: ['webhook:read', 'webhook:write'],
      };

      const response = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send(dto)
        .expect(HttpStatus.CREATED);

      expect(response.body.message).toContain('Store the rawKey securely');
      expect(response.body.rawKey).toBeDefined();
      expect(response.body.rawKey).toMatch(/^nk_/);
      expect(response.body.apiKey.name).toBe('Test Key');
      expect(response.body.apiKey.prefix).toBe(response.body.rawKey.substring(0, 8));
      expect(response.body.apiKey.scopes).toEqual(['webhook:read', 'webhook:write']);
    });

    it('should generate a key with expiry date', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const dto = {
        name: 'Expiring Key',
        scopes: ['webhook:read'],
        expiresAt: expiresAt.toISOString(),
      };

      const response = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send(dto)
        .expect(HttpStatus.CREATED);

      expect(response.body.apiKey.expiresAt).toBeDefined();
    });
  });

  describe('GET /admin/api-keys', () => {
    it('should list all API keys without hashed keys', async () => {
      // Create a key first
      await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send({ name: 'Key 1', scopes: ['webhook:read'] });

      const response = await request(app.getHttpServer())
        .get('/admin/api-keys')
        .expect(HttpStatus.OK);

      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
      
      // Ensure hashedKey is not returned
      const key = response.body.data[0];
      expect(key.hashedKey).toBeUndefined();
      expect(key.prefix).toBeDefined();
    });
  });

  describe('API Key Authentication', () => {
    let rawKey: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send({ name: 'Auth Test Key', scopes: ['webhook:read', 'webhook:write'] });
      
      rawKey = response.body.rawKey;
    });

    it('should authenticate with valid API key via X-API-Key header', async () => {
      const response = await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', rawKey)
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('active');
    });

    it('should return 401 without API key', async () => {
      await request(app.getHttpServer())
        .get('/webhooks/status')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 401 with invalid API key', async () => {
      await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', 'invalid_key')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 with insufficient scope', async () => {
      // Create a key with only read scope
      const readKeyResponse = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send({ name: 'Read Only Key', scopes: ['webhook:read'] });

      const readKey = readKeyResponse.body.rawKey;

      // Try to access write endpoint
      await request(app.getHttpServer())
        .post('/webhooks/payment')
        .set('X-API-Key', readKey)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('API Key Revocation', () => {
    it('should revoke an API key and return 401 immediately', async () => {
      // Create a key
      const createResponse = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send({ name: 'Revocation Test', scopes: ['webhook:read'] });

      const keyId = createResponse.body.apiKey.id;
      const rawKey = createResponse.body.rawKey;

      // Verify it works
      await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', rawKey)
        .expect(HttpStatus.OK);

      // Revoke the key
      await request(app.getHttpServer())
        .post(`/admin/api-keys/${keyId}/revoke`)
        .expect(HttpStatus.OK);

      // Should now fail
      await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', rawKey)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('API Key Expiration', () => {
    it('should return 401 with expiry message for expired key', async () => {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() - 1); // Already expired

      const createResponse = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send({
          name: 'Expired Key',
          scopes: ['webhook:read'],
          expiresAt: expiresAt.toISOString(),
        });

      const rawKey = createResponse.body.rawKey;

      await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', rawKey)
        .expect(HttpStatus.UNAUTHORIZED)
        .expect((res) => {
          expect(res.body.message).toContain('expired');
        });
    });
  });

  describe('API Key Rotation', () => {
    it('should rotate key and keep old key active for 5 minutes', async () => {
      // Create a key
      const createResponse = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send({ name: 'Rotation Test', scopes: ['webhook:read'] });

      const keyId = createResponse.body.apiKey.id;
      const oldRawKey = createResponse.body.rawKey;

      // Rotate the key
      const rotateResponse = await request(app.getHttpServer())
        .post(`/admin/api-keys/${keyId}/rotate`)
        .send({ name: 'Rotation Test (rotated)' })
        .expect(HttpStatus.OK);

      const newRawKey = rotateResponse.body.rawKey;

      // Both keys should work during grace period
      await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', oldRawKey)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', newRawKey)
        .expect(HttpStatus.OK);

      expect(rotateResponse.body.message).toContain('5 minutes');
    });
  });

  describe('Usage Logging', () => {
    it('should log every API key usage with timestamp, endpoint, status, and latency', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send({ name: 'Logging Test', scopes: ['webhook:read'] });

      const rawKey = createResponse.body.rawKey;

      // Make several requests
      await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', rawKey);

      await request(app.getHttpServer())
        .get('/webhooks/status')
        .set('X-API-Key', rawKey);

      // Wait a bit for async logging
      await new Promise(resolve => setTimeout(resolve, 100));

      const logs = await usageLogRepo.find();
      expect(logs.length).toBeGreaterThanOrEqual(2);

      const log = logs[0];
      expect(log.endpoint).toContain('GET');
      expect(log.responseStatus).toBeDefined();
      expect(log.latencyMs).toBeDefined();
      expect(log.timestamp).toBeDefined();
    });
  });

  describe('Scope Enforcement', () => {
    it('should prevent webhook key from calling admin endpoints', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/admin/api-keys')
        .send({ name: 'Webhook Only Key', scopes: ['webhook:read'] });

      const rawKey = createResponse.body.rawKey;

      // Webhook key should not be able to call admin endpoints
      // (admin endpoints use JWT auth, not API key auth)
      await request(app.getHttpServer())
        .get('/admin/api-keys')
        .set('X-API-Key', rawKey)
        .expect(HttpStatus.UNAUTHORIZED); // No JWT token
    });
  });
});
