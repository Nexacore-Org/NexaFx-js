import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

describe('KYC End-to-End Flow (e2e)', () => {
  jest.setTimeout(20000);
  let app: INestApplication;
  let userToken: string;
  let adminToken: string;
  let userId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_BULL = 'true';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'postgres';
    process.env.DB_NAME = 'nexafx_test';
    process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars';
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-must-be-at-least-32';
    process.env.OTP_SECRET = 'test-otp-secret-must-be-at-least-32-chars';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'test@example.com';
    process.env.MAIL_PASSWORD = 'test-password';
    process.env.MAIL_FROM = 'test@example.com';

    const { AppModule } = await import('../../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    // Helper: Register and login an admin account to verify reviews
    const adminReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'admin@nexafx.com',
        password: 'adminpassword123',
        firstName: 'System',
        lastName: 'Admin',
      });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@nexafx.com', password: 'adminpassword123' });

    adminToken = adminLogin.body.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // --- PATH 1: HAPPY PATH APPROVAL ---
  it('should register, submit KYC, approve as admin, and verify ENHANCED tier', async () => {
    // 1. Register User
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'farmer_happy@example.com',
        password: 'strongpassword123',
        firstName: 'John',
        lastName: 'Doe',
      })
      .expect(201);

    userToken = registerRes.body.accessToken;
    userId = registerRes.body.user?.id || 'user-id-placeholder';

    // 2. Submit KYC
    await request(app.getHttpServer())
      .post('/api/v1/kyc/submit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ documentUrl: 'https://example.com/id.jpg', tierRequested: 'ENHANCED' })
      .expect(201);

    // 3. Admin Approves
    await request(app.getHttpServer())
      .post('/api/v1/admin/kyc/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: userId, status: 'APPROVED' })
      .expect(200);

    // 4. Assertions: Profile reflects changes
    const profileRes = await request(app.getHttpServer())
      .get('/api/v1/user/profile')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(profileRes.body.isVerified).toBe(true);
    expect(profileRes.body.kycTier).toBe('ENHANCED');
  });

  // --- PATH 2: REJECTION PATH ---
  it('should handle KYC rejection and store the rejection reason', async () => {
    // 1. Register another user
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'farmer_reject@example.com',
        password: 'strongpassword123',
        firstName: 'Jane',
        lastName: 'Doe',
      })
      .expect(201);

    const targetUserToken = registerRes.body.accessToken;
    const targetUserId = registerRes.body.user?.id || 'user-id-placeholder';

    // 2. Submit KYC
    await request(app.getHttpServer())
      .post('/api/v1/kyc/submit')
      .set('Authorization', `Bearer ${targetUserToken}`)
      .send({ documentUrl: 'https://example.com/blurred.jpg', tierRequested: 'ENHANCED' })
      .expect(201);

    // 3. Admin Rejects
    await request(app.getHttpServer())
      .post('/api/v1/admin/kyc/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: targetUserId, status: 'REJECTED', reason: 'Documents blurred' })
      .expect(200);

    // 4. Assertions: Rejection state validation
    const profileRes = await request(app.getHttpServer())
      .get('/api/v1/user/profile')
      .set('Authorization', `Bearer ${targetUserToken}`)
      .expect(200);

    expect(profileRes.body.isVerified).toBe(false);
    expect(profileRes.body.rejectionReason).toBe('Documents blurred');
  });
});