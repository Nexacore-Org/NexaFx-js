import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../src/modules/users/entities/user.entity';
import { UserPreferenceEntity } from '../src/modules/users/entities/user-preference.entity';
import { UserSettingsEntity } from '../src/modules/users/entities/user-settings.entity';
import { WalletEntity } from '../src/modules/users/entities/wallet.entity';
import { AdminAuditLogEntity } from '../src/modules/admin-audit/entities/admin-audit-log.entity';
import { UsersModule } from '../src/modules/users/users.module';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';

describe('UserSettings (e2e)', () => {
  let app: INestApplication;
  const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /users/me/settings', () => {
    it('should return default settings for new user', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me/settings')
        .set('x-user-id', USER_ID)
        .expect(200);

      expect(res.body).toMatchObject({
        userId: USER_ID,
        displayCurrency: 'USD',
        language: 'en',
        timezone: 'UTC',
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: true,
      });
    });
  });

  describe('PUT /users/me/settings', () => {
    it('should update valid settings fields', async () => {
      const res = await request(app.getHttpServer())
        .put('/users/me/settings')
        .set('x-user-id', USER_ID)
        .send({ displayCurrency: 'EUR', language: 'fr', emailNotifications: false })
        .expect(200);

      expect(res.body.displayCurrency).toBe('EUR');
      expect(res.body.language).toBe('fr');
      expect(res.body.emailNotifications).toBe(false);
    });

    it('should persist changes across requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me/settings')
        .set('x-user-id', USER_ID)
        .expect(200);

      expect(res.body.displayCurrency).toBe('EUR');
      expect(res.body.language).toBe('fr');
    });

    it('should reject invalid currency', async () => {
      await request(app.getHttpServer())
        .put('/users/me/settings')
        .set('x-user-id', USER_ID)
        .send({ displayCurrency: 'INVALID' })
        .expect(400);
    });

    it('should reject invalid language', async () => {
      await request(app.getHttpServer())
        .put('/users/me/settings')
        .set('x-user-id', USER_ID)
        .send({ language: 'xyz123' })
        .expect(400);
    });
  });

  describe('PUT /users/me/settings/export', () => {
    it('should return settings as JSON export', async () => {
      const res = await request(app.getHttpServer())
        .put('/users/me/settings/export')
        .set('x-user-id', USER_ID)
        .expect(200);

      expect(res.body).toHaveProperty('displayCurrency');
      expect(res.body).toHaveProperty('language');
      expect(res.body).toHaveProperty('timezone');
      expect(res.body).toHaveProperty('exportedAt');
    });
  });

  describe('Settings isolation', () => {
    it('should maintain separate settings for different users', async () => {
      const OTHER_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

      const res = await request(app.getHttpServer())
        .get('/users/me/settings')
        .set('x-user-id', OTHER_USER_ID)
        .expect(200);

      // Other user should have defaults
      expect(res.body.displayCurrency).toBe('USD');
    });
  });
});
