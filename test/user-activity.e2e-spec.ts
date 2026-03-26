import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../src/modules/users/entities/user.entity';
import { UserPreferenceEntity } from '../src/modules/users/entities/user-preference.entity';
import { UserSettingsEntity } from '../src/modules/users/entities/user-settings.entity';
import { WalletEntity } from '../src/modules/users/entities/wallet.entity';
import { AdminAuditLogEntity } from '../src/modules/admin-audit/entities/admin-audit-log.entity';
import { UsersModule } from '../src/modules/users/users.module';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';

describe('UserActivity Timeline (e2e)', () => {
  let app: INestApplication;
  const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [
            UserEntity,
            UserPreferenceEntity,
            UserSettingsEntity,
            WalletEntity,
            AdminAuditLogEntity,
          ],
          synchronize: true,
        }),
        UsersModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /users/:id/activity', () => {
    it('should return paginated activity events', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${USER_ID}/activity`)
        .set('x-user-id', USER_ID)
        .expect(200);

      expect(res.body).toHaveProperty('events');
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body).toHaveProperty('hasMore');
      expect(res.body).toHaveProperty('nextCursor');
    });

    it('should respect limit query param', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${USER_ID}/activity?limit=5`)
        .set('x-user-id', USER_ID)
        .expect(200);

      expect(res.body.events.length).toBeLessThanOrEqual(5);
    });

    it('should accept cursor query param without error', async () => {
      const cursor = new Date().toISOString();
      await request(app.getHttpServer())
        .get(`/users/${USER_ID}/activity?cursor=${cursor}`)
        .set('x-user-id', USER_ID)
        .expect(200);
    });
  });
});
