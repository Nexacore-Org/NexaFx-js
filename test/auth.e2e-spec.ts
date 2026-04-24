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

// Minimal stubs for dependencies
const mockMailService = { sendEmailVerification: jest.fn(), sendPasswordReset: jest.fn(), sendNewDeviceLogin: jest.fn() };
const mockReferralService = { applyReferralCode: jest.fn() };
const mockDeviceService = { registerOrUpdateDevice: jest.fn().mockResolvedValue({ device: { lastIp: '127.0.0.1', deviceName: 'Test' }, isNew: false }) };
const mockAuditService = { logAuthEvent: jest.fn() };
const mockSecretsService = { getValidSecrets: jest.fn().mockResolvedValue(['test-secret']) };
const mockCacheService = { isSessionRevoked: jest.fn().mockResolvedValue(false) };

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<UserEntity>;
  let refreshToken: string;
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
        { provide: 'SecretsService', useValue: mockSecretsService },
        { provide: 'CacheService', useValue: mockCacheService },
        {
          provide: JwtAuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
      ],
    })
      .overrideProvider('MailService').useValue(mockMailService)
      .overrideProvider('ReferralService').useValue(mockReferralService)
      .overrideProvider('DeviceService').useValue(mockDeviceService)
      .overrideProvider('AdminAuditService').useValue(mockAuditService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    userRepo = moduleFixture.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/register — creates user and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'P@ssw0rd123!',
        firstName: 'John',
        lastName: 'Doe',
      })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    refreshToken = res.body.refreshToken;
    accessToken = res.body.accessToken;
  });

  it('POST /auth/register — returns 409 for duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'P@ssw0rd123!',
        firstName: 'Jane',
        lastName: 'Doe',
      })
      .expect(409);
  });

  it('POST /auth/login — returns tokens for valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'P@ssw0rd123!',
        deviceKey: 'test-device',
      })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    refreshToken = res.body.refreshToken;
  });

  it('POST /auth/login — returns 401 for wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'WrongPassword!',
        deviceKey: 'test-device',
      })
      .expect(401);
  });

  it('POST /auth/refresh — rotates refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(refreshToken);
    refreshToken = res.body.refreshToken;
  });

  it('POST /auth/refresh — rejects old refresh token after rotation', async () => {
    const oldToken = refreshToken;
    // Rotate once more
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldToken })
      .expect(200);

    // Now try the old token again — should fail
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldToken })
      .expect(401);
  });

  it('POST /auth/logout — invalidates refresh token', async () => {
    // Login to get fresh tokens
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'P@ssw0rd123!', deviceKey: 'test-device' })
      .expect(200);

    const token = loginRes.body.refreshToken;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(204);

    // Refresh should now fail
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: token })
      .expect(401);
  });

  it('Passwords are stored hashed (not plaintext)', async () => {
    const user = await userRepo.findOne({ where: { email: 'test@example.com' } });
    expect(user?.passwordHash).not.toBe('P@ssw0rd123!');
    expect(user?.passwordHash).toContain(':'); // salt:hash format
  });
});
