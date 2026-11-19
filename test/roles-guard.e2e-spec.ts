import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { Role } from '../src/auth/enums/role.enum';

/**
 * The JWT guard is stubbed here so the test exercises the real global
 * RolesGuard without a database. The stub mirrors what `JwtAuthGuard` puts on
 * `request.user` for a verified token.
 */
@Controller('roles-probe')
class RolesProbeController {
  @Get('review')
  @Roles(Role.ADMIN, Role.COMPLIANCE)
  @UseGuards({
    canActivate: (context) => {
      const req = context.switchToHttp().getRequest();
      if (!req.headers['x-role']) return false;
      req.user = { id: 'u1', sub: 'u1', role: req.headers['x-role'] };
      return true;
    },
  } as any)
  review() {
    return { ok: true };
  }
}

describe('global RolesGuard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RolesProbeController],
      providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([Role.ADMIN, Role.COMPLIANCE])('allows a %s token', async (role) => {
    await request(app.getHttpServer())
      .get('/roles-probe/review')
      .set('x-role', role)
      .expect(200)
      .expect({ ok: true });
  });

  it('refuses a plain user token with 403', async () => {
    await request(app.getHttpServer())
      .get('/roles-probe/review')
      .set('x-role', Role.USER)
      .expect(403);
  });

  it('refuses an unauthenticated request', async () => {
    await request(app.getHttpServer()).get('/roles-probe/review').expect(403);
  });
});
