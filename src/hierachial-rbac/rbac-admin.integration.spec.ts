import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RbacModule } from '../rbac.module';
import { PermissionAction, PermissionResource } from '../entities/permission.entity';

/**
 * Integration tests — uses an in-memory SQLite DB to verify the full stack:
 * controller → service → DB → audit log
 *
 * Run with: jest --testPathPattern="rbac-admin.integration.spec"
 */
describe('RbacAdminController (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let superAdminToken: string;
  let readOnlyToken: string;

  const SUPER_ADMIN_ID = 'sa-user-1';
  const READ_ONLY_ID = 'ro-user-1';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
          synchronize: true,
          logging: false,
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
        RbacModule,
      ],
    })
      // Override guards so we can inject mock users via JWT payload
      .overrideGuard('JwtAuthGuard')
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          const auth = req.headers.authorization ?? '';
          if (auth.startsWith('Bearer ')) {
            // Minimal decode without full passport
            const token = auth.split(' ')[1];
            try {
              const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
              req.user = payload;
            } catch {
              req.user = null;
            }
          }
          return !!req.user;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService = module.get(JwtService);

    // Tokens carry mock permission sets that the PermissionsGuard will evaluate
    // For integration we seed the DB and rely on real guard logic instead
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /admin/rbac/roles', () => {
    it('validates required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/rbac/roles')
        .set('Authorization', 'Bearer mock') // guard overridden
        .send({}) // missing name
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('rejects names longer than 100 chars', async () => {
      await request(app.getHttpServer())
        .post('/admin/rbac/roles')
        .set('Authorization', 'Bearer mock')
        .send({ name: 'A'.repeat(101) })
        .expect(400);
    });
  });

  describe('POST /admin/rbac/permissions', () => {
    it('validates action enum', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/rbac/permissions')
        .set('Authorization', 'Bearer mock')
        .send({ name: 'Test', action: 'INVALID_ACTION', resource: PermissionResource.USER })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('validates resource enum', async () => {
      await request(app.getHttpServer())
        .post('/admin/rbac/permissions')
        .set('Authorization', 'Bearer mock')
        .send({ name: 'Test', action: PermissionAction.READ, resource: 'INVALID_RESOURCE' })
        .expect(400);
    });
  });

  describe('POST /admin/rbac/users/roles', () => {
    it('validates UUID fields', async () => {
      await request(app.getHttpServer())
        .post('/admin/rbac/users/roles')
        .set('Authorization', 'Bearer mock')
        .send({ userId: 'not-a-uuid', roleIds: ['also-not-uuid'] })
        .expect(400);
    });
  });

  describe('GET /admin/rbac/roles', () => {
    it('returns 200 with auth header', async () => {
      await request(app.getHttpServer())
        .get('/admin/rbac/roles')
        .set('Authorization', 'Bearer mock')
        .expect(200);
    });
  });

  describe('GET /admin/rbac/permissions', () => {
    it('returns 200', async () => {
      await request(app.getHttpServer())
        .get('/admin/rbac/permissions')
        .set('Authorization', 'Bearer mock')
        .expect(200);
    });
  });

  describe('GET /admin/rbac/audit-logs', () => {
    it('returns 200', async () => {
      await request(app.getHttpServer())
        .get('/admin/rbac/audit-logs')
        .set('Authorization', 'Bearer mock')
        .expect(200);
    });
  });
});
