import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { RecoveryModule } from '../recovery.module';
import { PasswordReset } from '../entities/password-reset.entity';

describe('Recovery Integration Tests', () => {
  let app: INestApplication;
  let resetToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [PasswordReset],
          synchronize: true,
        }),
        RecoveryModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Full Recovery Flow', () => {
    it('should complete full password recovery process', async () => {
      // Step 1: Request password reset
      const requestResponse = await request(app.getHttpServer())
        .post('/recovery/request')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(requestResponse.body.message).toBe(
        'Password reset instructions sent to your email',
      );
      expect(requestResponse.body.token).toBeDefined();
      resetToken = requestResponse.body.token;

      // Step 2: Validate token
      const validateResponse = await request(app.getHttpServer())
        .get(`/recovery/validate?token=${resetToken}`)
        .expect(200);

      expect(validateResponse.body.valid).toBe(true);
      expect(validateResponse.body.email).toBe('test@example.com');

      // Step 3: Reset password
      const resetResponse = await request(app.getHttpServer())
        .post('/recovery/reset')
        .send({
          token: resetToken,
          newPassword: 'NewSecurePassword123!',
        })
        .expect(200);

      expect(resetResponse.body.message).toBe('Password reset successful');

      // Step 4: Verify token is now invalid
      const invalidateResponse = await request(app.getHttpServer())
        .get(`/recovery/validate?token=${resetToken}`)
        .expect(200);

      expect(invalidateResponse.body.valid).toBe(false);
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .post('/recovery/reset')
        .send({
          token: 'invalid-token',
          newPassword: 'NewSecurePassword123!',
        })
        .expect(400);
    });

    it('should reject weak password', async () => {
      const requestResponse = await request(app.getHttpServer())
        .post('/recovery/request')
        .send({ email: 'test2@example.com' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/recovery/reset')
        .send({
          token: requestResponse.body.token,
          newPassword: 'weak',
        })
        .expect(400);
    });
  });
});
