/**
 * Security E2E Test Suite
 *
 * Covers every protected endpoint for:
 *   - 401 when no token is provided
 *   - 403 when token has insufficient role
 *   - 200 when token has the correct role
 *
 * Public endpoints are verified accessible without auth.
 * Each test creates its own JWT — no shared state between cases.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { JWT_SECRET } from '../src/auth/jwt.strategy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(
  jwtService: JwtService,
  role: string,
  userId = 1,
): string {
  return jwtService.sign(
    { sub: userId, username: `user-${role}`, role },
    { secret: JWT_SECRET, expiresIn: '5m' },
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Security E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // Public endpoints — no auth required
  // =========================================================================

  describe('Public endpoints', () => {
    it('GET /maintenance/status — accessible without auth (200)', () => {
      return request(app.getHttpServer())
        .get('/maintenance/status')
        .expect(200);
    });
  });

  // =========================================================================
  // PUT /maintenance/config
  // Requires: JwtAuthGuard + RolesGuard(@Roles('admin', 'superadmin'))
  // =========================================================================

  describe('PUT /maintenance/config', () => {
    it('401 — no token', () => {
      return request(app.getHttpServer())
        .put('/maintenance/config')
        .send({ enabled: true })
        .expect(401);
    });

    it('403 — authenticated as "user" role (insufficient)', () => {
      const token = makeToken(jwtService, 'user');
      return request(app.getHttpServer())
        .put('/maintenance/config')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: true })
        .expect(403);
    });

    it('200 — authenticated as "admin" role', () => {
      const token = makeToken(jwtService, 'admin');
      return request(app.getHttpServer())
        .put('/maintenance/config')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: false })
        .expect(200);
    });

    it('200 — authenticated as "superadmin" role', () => {
      const token = makeToken(jwtService, 'superadmin');
      return request(app.getHttpServer())
        .put('/maintenance/config')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: false })
        .expect(200);
    });
  });

  // =========================================================================
  // GET /users
  // Requires: JwtAuthGuard (any authenticated user)
  // =========================================================================

  describe('GET /users', () => {
    it('401 — no token', () => {
      return request(app.getHttpServer())
        .get('/users')
        .expect(401);
    });

    it('200 — authenticated as "user" role', () => {
      const token = makeToken(jwtService, 'user');
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('200 — authenticated as "admin" role', () => {
      const token = makeToken(jwtService, 'admin');
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  // =========================================================================
  // DELETE /users/:id
  // Requires: JwtAuthGuard + RolesGuard(@Roles('superadmin'))
  // =========================================================================

  describe('DELETE /users/:id', () => {
    it('401 — no token', () => {
      return request(app.getHttpServer())
        .delete('/users/42')
        .expect(401);
    });

    it('403 — authenticated as "user" role', () => {
      const token = makeToken(jwtService, 'user');
      return request(app.getHttpServer())
        .delete('/users/42')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('403 — authenticated as "admin" role (not superadmin)', () => {
      const token = makeToken(jwtService, 'admin');
      return request(app.getHttpServer())
        .delete('/users/42')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('200 — authenticated as "superadmin" role', () => {
      const token = makeToken(jwtService, 'superadmin');
      return request(app.getHttpServer())
        .delete('/users/42')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  // =========================================================================
  // POST /simulation/run
  // Requires: JwtAuthGuard; SandboxInterceptor short-circuits on header
  // =========================================================================

  describe('POST /simulation/run', () => {
    it('401 — no token', () => {
      return request(app.getHttpServer())
        .post('/simulation/run')
        .send({ scenario: 'test' })
        .expect(401);
    });

    it('200 — authenticated user can run simulation', () => {
      const token = makeToken(jwtService, 'user');
      return request(app.getHttpServer())
        .post('/simulation/run')
        .set('Authorization', `Bearer ${token}`)
        .send({ scenario: 'test' })
        .expect(200);
    });

    it('200 — sandbox mode header short-circuits (returns sandbox response)', async () => {
      const token = makeToken(jwtService, 'user');
      const res = await request(app.getHttpServer())
        .post('/simulation/run')
        .set('Authorization', `Bearer ${token}`)
        .set('x-sandbox-mode', 'true')
        .send({ scenario: 'test' })
        .expect(200);

      expect(res.body.sandbox).toBe(true);
    });
  });
});
