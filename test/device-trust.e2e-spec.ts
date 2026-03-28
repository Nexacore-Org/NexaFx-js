import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { DeviceController } from '../src/modules/sessions/controllers/device.controller';
import { DeviceService } from '../src/modules/sessions/services/device.service';
import { DeviceEntity } from '../src/modules/sessions/entities/device.entity';
import { AdminAuditService } from '../src/modules/admin-audit/admin-audit.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';
import { AdminAuditLogEntity } from '../src/modules/admin-audit/entities/admin-audit-log.entity';

const TEST_SECRET = 'test-jwt-secret';
const USER_ID = 'user-e2e-001';

function makeToken(sub = USER_ID) {
  return jwt.sign({ sub, id: sub }, TEST_SECRET, { expiresIn: '1h' });
}

/** Minimal JwtAuthGuard that validates against TEST_SECRET */
class TestJwtGuard {
  canActivate(context: any): boolean {
    const req = context.switchToHttp().getRequest();
    const auth: string = req.headers['authorization'] ?? '';
    if (!auth.startsWith('Bearer ')) return false;
    try {
      req.user = jwt.verify(auth.split(' ')[1], TEST_SECRET) as any;
      return true;
    } catch {
      return false;
    }
  }
}

describe('Device Trust (e2e)', () => {
  let app: INestApplication;
  let deviceRepo: Repository<DeviceEntity>;
  let auditRepo: Repository<AdminAuditLogEntity>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [DeviceEntity, AdminAuditLogEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([DeviceEntity, AdminAuditLogEntity]),
      ],
      controllers: [DeviceController],
      providers: [DeviceService, AdminAuditService],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    deviceRepo = module.get(getRepositoryToken(DeviceEntity));
    auditRepo = module.get(getRepositoryToken(AdminAuditLogEntity));
  });

  afterAll(() => app.close());

  afterEach(async () => {
    await deviceRepo.clear();
    await auditRepo.clear();
  });

  describe('GET /sessions/devices', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get('/sessions/devices')
        .expect(403); // guard returns false → NestJS throws 403
    });

    it('returns empty array when user has no devices', () => {
      return request(app.getHttpServer())
        .get('/sessions/devices')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.success).toBe(true);
          expect(body.data).toEqual([]);
        });
    });

    it('returns only devices belonging to the authenticated user (from JWT sub)', async () => {
      await deviceRepo.save([
        deviceRepo.create({ userId: USER_ID, deviceKey: 'fp-aaa', trustLevel: 'neutral', trustScore: 50 }),
        deviceRepo.create({ userId: 'other-user', deviceKey: 'fp-bbb', trustLevel: 'neutral', trustScore: 50 }),
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/sessions/devices')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].userId).toBe(USER_ID);
    });
  });

  describe('PATCH /sessions/devices/:id/trust', () => {
    it('updates trustLevel and persists audit log entry', async () => {
      const device = await deviceRepo.save(
        deviceRepo.create({ userId: USER_ID, deviceKey: 'fp-ccc', trustLevel: 'neutral', trustScore: 50 }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/sessions/devices/${device.id}/trust`)
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ trustLevel: 'trusted' })
        .expect(200);

      expect(body.success).toBe(true);
      expect(body.data.trustLevel).toBe('trusted');
      expect(body.data.trustScore).toBe(90);

      const logs = await auditRepo.find();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('UPDATE_DEVICE_TRUST');
      expect(logs[0].entityId).toBe(device.id);
      expect(logs[0].beforeSnapshot).toMatchObject({ trustLevel: 'neutral' });
    });

    it('returns 404 when device does not belong to the authenticated user', async () => {
      const device = await deviceRepo.save(
        deviceRepo.create({ userId: 'other-user', deviceKey: 'fp-ddd', trustLevel: 'neutral', trustScore: 50 }),
      );

      await request(app.getHttpServer())
        .patch(`/sessions/devices/${device.id}/trust`)
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ trustLevel: 'trusted' })
        .expect(404);
    });

    it('can ban a device by setting trustLevel to risky', async () => {
      const device = await deviceRepo.save(
        deviceRepo.create({ userId: USER_ID, deviceKey: 'fp-eee', trustLevel: 'neutral', trustScore: 50 }),
      );

      const { body } = await request(app.getHttpServer())
        .patch(`/sessions/devices/${device.id}/trust`)
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ trustLevel: 'risky' })
        .expect(200);

      expect(body.data.trustLevel).toBe('risky');
      expect(body.data.trustScore).toBe(10);
      expect(body.data.manuallyRisky).toBe(true);
    });
  });

  describe('DeviceService.registerOrUpdateDevice (integration)', () => {
    it('auto-registers a new device with neutral trust', async () => {
      const deviceService: DeviceService = app.get(DeviceService);
      const device = await deviceService.registerOrUpdateDevice({
        userId: USER_ID,
        deviceKey: 'fp-fingerprint-xyz',
        userAgent: 'TestAgent/1.0',
        platform: 'Linux',
        browser: 'Chrome',
        lastIp: '10.0.0.1',
      });

      expect(device.trustLevel).toBe('neutral');
      expect(device.trustScore).toBe(50);
      expect(device.deviceKey).toBe('fp-fingerprint-xyz');
    });

    it('blocks login for banned device', async () => {
      const deviceService: DeviceService = app.get(DeviceService);
      await deviceRepo.save(
        deviceRepo.create({
          userId: USER_ID,
          deviceKey: 'fp-banned',
          trustLevel: 'risky',
          trustScore: 10,
        }),
      );

      await expect(
        deviceService.registerOrUpdateDevice({ userId: USER_ID, deviceKey: 'fp-banned' }),
      ).rejects.toThrow('Device is banned');
    });
  });
});
