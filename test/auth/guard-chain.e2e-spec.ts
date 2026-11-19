import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { TokenVersionGuard } from '../../src/auth/token-version.guard';
import { TokenVersionService } from '../../src/auth/token-version.service';
import { ImpersonationGuard } from '../../src/auth/impersonation.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { Roles } from '../../src/auth/decorators/roles.decorator';
import { Role } from '../../src/auth/enums/role.enum';
import { TokenType } from '../../src/auth/token-types';

/**
 * Issue #1537: boots the real guards in their intended order (JwtAuthGuard -> TokenVersionGuard ->
 * ImpersonationGuard -> RolesGuard) on a sample controller, with an in-memory user table. No
 * database or AppModule is needed.
 */
const SECRET = 'e2e-secret-e2e-secret-e2e-secret-123';
const users: Record<string, { id: string; tokenVersion: number }> = {
  admin: { id: 'admin', tokenVersion: 2 },
  user: { id: 'user', tokenVersion: 0 },
};

@Controller('sample')
class SampleController {
  @Get('me')
  me() {
    return { ok: true };
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  admin() {
    return { admin: true };
  }

  @Post('transfer')
  transfer() {
    return { moved: true };
  }
}

describe('guard chain (issue #1537)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      controllers: [SampleController],
      providers: [
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'jwt.secret' ? SECRET : undefined) } },
        {
          provide: TokenVersionService,
          useValue: { currentVersion: async (id: string) => users[id]?.tokenVersion ?? null },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TokenVersionGuard },
        { provide: APP_GUARD, useClass: ImpersonationGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(() => app.close());

  const token = (claims: Record<string, unknown>) =>
    jwt.sign({ typ: TokenType.ACCESS, email: 'x@y.z', ...claims }, { secret: SECRET, expiresIn: 60 });
  const get = (path: string, t?: string) => request(app.getHttpServer()).get(path).set(t ? { Authorization: `Bearer ${t}` } : {});
  const post = (path: string, t: string) => request(app.getHttpServer()).post(path).set({ Authorization: `Bearer ${t}` });

  it('rejects a request without a token (JwtAuthGuard first)', async () => {
    await get('/sample/me').expect(401);
  });

  it('accepts a valid token at the current version', async () => {
    await get('/sample/me', token({ sub: 'user', role: 'user', tv: 0 })).expect(200);
  });

  it('rejects a stale token before roles are even considered (TokenVersionGuard)', async () => {
    // The admin was demoted/bumped to version 2; this token still says 1 and claims admin.
    await get('/sample/admin', token({ sub: 'admin', role: 'admin', tv: 1 })).expect(401);
  });

  it('a user without the role gets 403, an admin at the current version gets 200 (RolesGuard)', async () => {
    await get('/sample/admin', token({ sub: 'user', role: 'user', tv: 0 })).expect(403);
    await get('/sample/admin', token({ sub: 'admin', role: 'admin', tv: 2 })).expect(200);
  });

  it('an impersonation session is read-only (ImpersonationGuard)', async () => {
    const t = token({ sub: 'user', role: 'user', tv: 0, impersonation: true, act: { sub: 'admin' } });
    await get('/sample/me', t).expect(200);
    await post('/sample/transfer', t).expect(403);
  });

  it('a normal session may write', async () => {
    await post('/sample/transfer', token({ sub: 'user', role: 'user', tv: 0 })).expect(201);
  });
});
