import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType, ValidationPipe } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import * as request from 'supertest';
import { VersioningModule } from '../../src/versioning/versioning.module';
import {
  API_VERSION_HEADER,
  API_DEPRECATED_HEADER,
  API_SUNSET_DATE_HEADER,
  LINK_HEADER,
} from '../../src/versioning/constants/api-version.constants';

describe('API Versioning Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [VersioningModule],
    }).compile();

    app = module.createNestApplication();

    app.enableVersioning({
      type: VersioningType.URI,
      prefix: 'v',
      defaultVersion: '2',
    });

    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── V2 Routes (Current) ────────────────────────────────────────────────

  describe('GET /v2/users', () => {
    it('should return 200 with paginated response', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/users')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should include X-API-Version: 2 header', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/users')
        .expect(200);

      expect(res.headers[API_VERSION_HEADER.toLowerCase()]).toBe('2');
    });

    it('should NOT include X-API-Deprecated header', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/users')
        .expect(200);

      expect(res.headers[API_DEPRECATED_HEADER.toLowerCase()]).toBeUndefined();
    });

    it('should return users with firstName/lastName fields (V2 format)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/users')
        .expect(200);

      const user = res.body.data[0];
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('lastName');
      expect(user).toHaveProperty('createdAt');
      expect(user).not.toHaveProperty('name'); // V1 field should not exist
    });
  });

  describe('GET /v2/users/:id', () => {
    it('should return single user by id', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/users/1')
        .expect(200);

      expect(res.body).toHaveProperty('id', '1');
      expect(res.body).toHaveProperty('firstName');
      expect(res.body).toHaveProperty('lastName');
    });
  });

  describe('GET /v2/users/version', () => {
    it('should return version summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/users/version')
        .expect(200);

      expect(res.body).toHaveProperty('currentVersion', '2');
      expect(res.body).toHaveProperty('supportedVersions');
      expect(res.body).toHaveProperty('deprecatedVersions');
    });
  });

  // ─── V1 Routes (Deprecated) ─────────────────────────────────────────────

  describe('GET /v1/users', () => {
    it('should return 200 (deprecated but still active)', async () => {
      await request(app.getHttpServer()).get('/v1/users').expect(200);
    });

    it('should include X-API-Version: 1 header', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/users')
        .expect(200);

      expect(res.headers[API_VERSION_HEADER.toLowerCase()]).toBe('1');
    });

    it('should include X-API-Deprecated: true header', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/users')
        .expect(200);

      expect(res.headers[API_DEPRECATED_HEADER.toLowerCase()]).toBe('true');
    });

    it('should include Sunset header', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/users')
        .expect(200);

      expect(res.headers[API_SUNSET_DATE_HEADER.toLowerCase()]).toBe(
        '2026-01-01',
      );
    });

    it('should include Link header pointing to v2', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/users')
        .expect(200);

      expect(res.headers[LINK_HEADER.toLowerCase()]).toContain('/v2/');
      expect(res.headers[LINK_HEADER.toLowerCase()]).toContain(
        'successor-version',
      );
    });

    it('should return users with flat name field (V1 format)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/users')
        .expect(200);

      const user = res.body[0];
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('email');
      expect(user).not.toHaveProperty('firstName'); // V2 field should not exist
    });
  });

  // ─── Version Differences ────────────────────────────────────────────────

  describe('Response structure differences between versions', () => {
    it('v1 returns array directly, v2 returns paginated wrapper', async () => {
      const [v1Res, v2Res] = await Promise.all([
        request(app.getHttpServer()).get('/v1/users'),
        request(app.getHttpServer()).get('/v2/users'),
      ]);

      expect(Array.isArray(v1Res.body)).toBe(true);
      expect(v2Res.body).toHaveProperty('data');
      expect(v2Res.body).toHaveProperty('meta');
    });

    it('v1 uses flat name, v2 uses firstName + lastName', async () => {
      const [v1Res, v2Res] = await Promise.all([
        request(app.getHttpServer()).get('/v1/users'),
        request(app.getHttpServer()).get('/v2/users'),
      ]);

      expect(v1Res.body[0]).toHaveProperty('name');
      expect(v2Res.body.data[0]).toHaveProperty('firstName');
      expect(v2Res.body.data[0]).toHaveProperty('lastName');
    });
  });
});
