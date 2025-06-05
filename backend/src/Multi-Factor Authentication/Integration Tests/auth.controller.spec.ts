import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthController (Integration)', () => {
  let app: INestApplication;
  let authService: AuthService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            generate2FASecret: jest.fn(),
            enable2FA: jest.fn(),
            disable2FA: jest.fn(),
            get2FAStatus: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    authService = moduleFixture.get<AuthService>(AuthService);
    await app.init();
  });

  describe('/auth/login (POST)', () => {
    it('should login without 2FA', () => {
      const loginResponse = {
        access_token: 'jwt-token',
        user: { id: 1, email: 'test@example.com', twoFactorEnabled: false }
      };
      jest.spyOn(authService, 'login').mockResolvedValue(loginResponse);

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200)
        .expect(loginResponse);
    });

    it('should require 2FA when enabled', () => {
      const requiresTwoFactor = {
        requiresTwoFactor: true,
        message: '2FA code required'
      };
      jest.spyOn(authService, 'login').mockResolvedValue(requiresTwoFactor);

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200)
        .expect(requiresTwoFactor);
    });

    it('should validate login DTO', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'invalid-email',
          password: '123' // Too short
        })
        .expect(400);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
