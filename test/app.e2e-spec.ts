process.env.DISABLE_BULL = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';
import { AdminGuard } from '../src/modules/auth/guards/admin.guard';
import { RateLimitGuard } from '../src/modules/rate-limit/guards/rate-limit.guard';

describe('App bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(AdminGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const routes: Array<{ method: 'get'; path: string }> = [
    { method: 'get', path: '/' },
    { method: 'get', path: '/status' },
    { method: 'get', path: '/admin/rpc-health' },
    { method: 'get', path: '/admin/feature-flags' },
    { method: 'get', path: '/transactions/search' },
    { method: 'get', path: '/admin/transactions' },
    { method: 'get', path: '/users' },
    { method: 'get', path: '/sessions/devices' },
    { method: 'get', path: '/admin/notifications' },
    { method: 'get', path: '/admin/reconciliation' },
    { method: 'get', path: '/experiments' },
    { method: 'get', path: '/fee' },
    { method: 'get', path: '/admin/transaction-risk' },
    { method: 'get', path: '/webhooks' },
    { method: 'get', path: '/admin/secrets' },
    { method: 'get', path: '/admin/archive' },
    { method: 'get', path: '/announcements' },
    { method: 'get', path: '/goals' },
    { method: 'get', path: '/ledger' },
  ];

  routes.forEach(({ method, path }) => {
    it(`${path} should respond (not 404)`, async () => {
      const httpServer = app.getHttpServer();
      const agent = request(httpServer)[method](path).set('Authorization', 'Bearer test-token');

      await agent.expect((res) => {
        if (res.status === 404) {
          throw new Error(`Route ${path} returned 404`);
        }
      });
    });
  });
});
