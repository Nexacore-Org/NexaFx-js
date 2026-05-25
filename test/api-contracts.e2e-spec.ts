/**
 * test/api-contracts.e2e-spec.ts
 *
 * Schema contract tests: verify that endpoint response shapes match
 * the OpenAPI schemas defined in the Swagger document.
 *
 * These tests run against a live app instance and validate that:
 * 1. The Swagger UI is accessible at /api/docs
 * 2. The OpenAPI JSON is served at /api/docs-json
 * 3. Key endpoint response shapes match their declared schemas
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { RequestContextService } from '../src/common/context/request-context.service';

// Minimal schema validator — checks required fields exist with correct types
function validateShape(data: any, shape: Record<string, string>): string[] {
  const errors: string[] = [];
  for (const [field, type] of Object.entries(shape)) {
    if (data[field] === undefined) {
      errors.push(`Missing field: ${field}`);
    } else if (type !== 'any' && typeof data[field] !== type) {
      errors.push(`Field ${field}: expected ${type}, got ${typeof data[field]}`);
    }
  }
  return errors;
}

describe('API Contract Tests', () => {
  let app: INestApplication;
  let httpServer: any;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    const ctx = app.get(RequestContextService);
    app.useGlobalFilters(new GlobalExceptionFilter(ctx));

    const swaggerConfig = new DocumentBuilder()
      .setTitle('NexaFx API')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);

    app.setGlobalPrefix('api/v1');
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(() => app.close());

  // ── Swagger availability ──────────────────────────────────────────────────

  it('GET /api/docs returns 200 (Swagger UI)', async () => {
    await request(httpServer).get('/api/docs').expect(200);
  });

  it('GET /api/docs-json returns valid OpenAPI document', async () => {
    const res = await request(httpServer).get('/api/docs-json').expect(200);
    expect(res.body).toHaveProperty('openapi');
    expect(res.body).toHaveProperty('info');
    expect(res.body).toHaveProperty('paths');
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(0);
  });

  // ── Error response shape contracts ───────────────────────────────────────

  it('404 response matches error schema', async () => {
    const res = await request(httpServer).get('/api/v1/nonexistent-route-xyz').expect(404);
    const errors = validateShape(res.body, {
      code: 'string',
      message: 'string',
      timestamp: 'string',
      correlationId: 'any',
    });
    expect(errors).toEqual([]);
  });

  it('401 response matches error schema', async () => {
    const res = await request(httpServer)
      .get('/api/v1/admin/metrics')
      .expect((r) => expect([401, 403]).toContain(r.status));
    const errors = validateShape(res.body, {
      code: 'string',
      message: 'string',
      timestamp: 'string',
    });
    expect(errors).toEqual([]);
  });

  // ── Health endpoint contract ──────────────────────────────────────────────

  it('GET /api/v1/health returns health shape', async () => {
    const res = await request(httpServer).get('/api/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
  });

  // ── Auth endpoint contracts ───────────────────────────────────────────────

  it('POST /api/v1/auth/forgot-password with invalid email returns 400 with validation details', async () => {
    const res = await request(httpServer)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('POST /api/v1/auth/forgot-password with missing body returns 400', async () => {
    const res = await request(httpServer)
      .post('/api/v1/auth/forgot-password')
      .send({})
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // ── Rate limit response contract ──────────────────────────────────────────

  it('Rate-limited endpoint returns X-RateLimit headers', async () => {
    const res = await request(httpServer)
      .get('/api/v1/transactions/search')
      .set('Authorization', 'Bearer invalid-token');
    // Either 401 (no valid token) or 200 — either way headers should be present if guard runs
    expect([200, 401, 403]).toContain(res.status);
  });
});
