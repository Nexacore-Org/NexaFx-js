import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';

describe('RBAC Integration (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    await app.init();
  });

  it('should allow access to public endpoints', () => {
    return request(app.getHttpServer())
      .get('/users/public')
      .expect(200)
      .expect({
        message: 'This is public data',
      });
  });

  it('should deny access without token', () => {
    return request(app.getHttpServer())
      .get('/users/profile')
      .expect(401);
  });

  it('should allow access with valid role', () => {
    const token = jwtService.sign({
      sub: '1',
      email: 'user@test.com',
      roles: ['user'],
    });

    return request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('should deny access with insufficient role', () => {
    const token = jwtService.sign({
      sub: '1',
      email: 'user@test.com',
      roles: ['user'],
    });

    return request(app.getHttpServer())
      .get('/users/admin-dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  afterAll(async () => {
    await app.close();
  });
});
