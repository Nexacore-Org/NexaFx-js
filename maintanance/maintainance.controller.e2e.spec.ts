import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { MaintenanceModule } from './maintenance.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceConfig } from './entities/maintenance-config.entity';

describe('MaintenanceController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [MaintenanceConfig],
          synchronize: true,
        }),
        MaintenanceModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /maintenance/status', () => {
    it('should return maintenance status', () => {
      return request(app.getHttpServer())
        .get('/maintenance/status')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('isMaintenanceMode');
          expect(res.body).toHaveProperty('message');
        });
    });
  });

  describe('POST /maintenance/enable', () => {
    it('should enable maintenance mode', () => {
      return request(app.getHttpServer())
        .post('/maintenance/enable')
        .send({
          message: 'Test maintenance',
          estimatedEndTime: '2024-12-31T23:59:59Z',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Maintenance mode enabled');
          expect(res.body.config.isMaintenanceMode).toBe(true);
        });
    });

    it('should validate request body', () => {
      return request(app.getHttpServer())
        .post('/maintenance/enable')
        .send({
          message: 123, // Invalid type
        })
        .expect(400);
    });
  });

  describe('POST /maintenance/disable', () => {
    it('should disable maintenance mode', async () => {
      // First enable
      await request(app.getHttpServer())
        .post('/maintenance/enable')
        .send({ message: 'Test' });

      // Then disable
      return request(app.getHttpServer())
        .post('/maintenance/disable')
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Maintenance mode disabled');
        });
    });
  });

  describe('PUT /maintenance/config', () => {
    it('should update configuration', () => {
      return request(app.getHttpServer())
        .put('/maintenance/config')
        .send({
          message: 'Updated message',
          bypassRoles: ['admin', 'ops'],
          disabledEndpoints: ['/api/v1/users/*'],
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.config.message).toBe('Updated message');
          expect(res.body.config.bypassRoles).toContain('admin');
          expect(res.body.config.disabledEndpoints).toContain(
            '/api/v1/users/*',
          );
        });
    });
  });
});