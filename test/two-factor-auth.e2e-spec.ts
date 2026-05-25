import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../src/modules/users/entities/user.entity';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { TwoFactorController } from '../src/modules/auth/two-factor.controller';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';

const mockMailService = { sendEmailVerification: jest.fn(), sendPasswordReset: jest.fn(), sendNewDeviceLogin: jest.fn() };
const mockReferralService = { applyReferralCode: jest.fn() };
const mockDeviceService = { registerOrUpdateDevice: jest.fn().mockResolvedValue({ device: {}, isNew: false }) };
const mockAuditService = { logAuthEvent: jest.fn() };

describe('Two-Factor Auth (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<UserEntity>;
  let totpService: TotpService;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [UserEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([UserEntity]),
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [AuthController, TwoFactorController],
      providers: [
        AuthService,
        TotpService,
        { provide: 'MailService', useValue: mockMailService },
        { provide: 'ReferralService', useValue: mockReferralService },
        { provide: 'DeviceService', useValue: mockDeviceService },
        { provide: 'AdminAuditService', useValue: mockAuditService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    // Override JwtAuthGuard to inject user from header for testing
    const jwtGuard = moduleFixture.get(JwtAuthGuard);
    jest.spyOn(jwtGuard, 'canActivate').mockImplementation((ctx) => {
      const req = ctx.switchToHttp().getRequest();
      const authHeader = req.headers['x-test-user-id'];
      if (authHeader) {
        req.user = { sub: authHeader };
        return true;
      }
      return false;
    });

    await app.init();

    userRepo = moduleFixture.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
    totpService = moduleFixture.get(TotpService);

    // Register a user
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: '2fa@example.com', password: 'P@ssw0rd123!', firstName: 'Test', lastName: 'User' })
      .expect(201);

    userId = res.body.user.id;
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let totpSecret: string;
  let backupCodes: string[];

  it('POST /auth/2fa/enable — returns secret and QR URI', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/2fa/enable')
      .set('x-test-user-id', userId)
      .expect(200);

    expect(res.body.secret).toBeDefined();
    expect(res.body.qrUri).toContain('otpauth://totp/');
    totpSecret = res.body.secret;
  });

  it('POST /auth/2fa/verify — activates 2FA with valid OTP', async () => {
    const otp = totpService['generateTotp'](totpSecret, Math.floor(Date.now() / 1000 / 30));

    const res = await request(app.getHttpServer())
      .post('/auth/2fa/verify')
      .set('x-test-user-id', userId)
      .send({ otp })
      .expect(200);

    expect(res.body.backupCodes).toHaveLength(10);
    backupCodes = res.body.backupCodes;

    const user = await userRepo.findOne({ where: { id: userId } });
    expect(user?.twoFactorEnabled).toBe(true);
  });

  it('POST /auth/2fa/verify — rejects invalid OTP', async () => {
    await request(app.getHttpServer())
      .post('/auth/2fa/verify')
      .set('x-test-user-id', userId)
      .send({ otp: '000000' })
      .expect(401);
  });

  it('POST /auth/2fa/backup — regenerates backup codes with valid OTP', async () => {
    const otp = totpService['generateTotp'](totpSecret, Math.floor(Date.now() / 1000 / 30));

    const res = await request(app.getHttpServer())
      .post('/auth/2fa/backup')
      .set('x-test-user-id', userId)
      .send({ otp })
      .expect(200);

    expect(res.body.backupCodes).toHaveLength(10);
    backupCodes = res.body.backupCodes;
  });

  it('POST /auth/2fa/recover — logs in with backup code (single-use)', async () => {
    const code = backupCodes[0];

    const res = await request(app.getHttpServer())
      .post('/auth/2fa/recover')
      .send({ email: '2fa@example.com', password: 'P@ssw0rd123!', backupCode: code })
      .expect(200);

    expect(res.body.message).toContain('Recovery successful');

    // Same code should fail now (single-use)
    await request(app.getHttpServer())
      .post('/auth/2fa/recover')
      .send({ email: '2fa@example.com', password: 'P@ssw0rd123!', backupCode: code })
      .expect(401);
  });

  it('POST /auth/2fa/disable — disables 2FA with valid OTP', async () => {
    // Re-enable first
    await request(app.getHttpServer())
      .post('/auth/2fa/enable')
      .set('x-test-user-id', userId);

    const user = await userRepo.findOne({ where: { id: userId } });
    const secret = user!.twoFactorSecret!;
    const otp = totpService['generateTotp'](secret, Math.floor(Date.now() / 1000 / 30));

    // Verify to activate
    await request(app.getHttpServer())
      .post('/auth/2fa/verify')
      .set('x-test-user-id', userId)
      .send({ otp });

    const freshUser = await userRepo.findOne({ where: { id: userId } });
    const freshSecret = freshUser!.twoFactorSecret!;
    const disableOtp = totpService['generateTotp'](freshSecret, Math.floor(Date.now() / 1000 / 30));

    const res = await request(app.getHttpServer())
      .post('/auth/2fa/disable')
      .set('x-test-user-id', userId)
      .send({ otp: disableOtp })
      .expect(200);

    expect(res.body.message).toContain('disabled');

    const disabledUser = await userRepo.findOne({ where: { id: userId } });
    expect(disabledUser?.twoFactorEnabled).toBe(false);
  });
});
