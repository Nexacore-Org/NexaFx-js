import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Permission } from './permission.entity';
import { Repository } from 'typeorm';

describe('PermissionsController (e2e)', () => {
  let app: INestApplication;
  let permissionsRepository: Repository<Permission>;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    permissionsRepository = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    
    await app.init();

    // Get auth token (implement based on your auth system)
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password' });
    
    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/permissions (GET)', () => {
    it('should return permissions with pagination', () => {
      return request(app.getHttpServer())
        .get('/permissions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should filter by resource', () => {
      return request(app.getHttpServer())
        .get('/permissions?resource=users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('should return 401 without auth token', () => {
      return request(app.getHttpServer())
        .get('/permissions')
        .expect(401);
    });
  });

  describe('/permissions (POST)', () => {
    it('should create a new permission', () => {
      const createDto = {
        name: 'posts:create',
        description: 'Create new posts',
        resource: 'posts',
        action: 'create',
      };

      return request(app.getHttpServer())
        .post('/permissions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(201)
        .expect((res) => {
          expect(res.body.name).toBe(createDto.name);
          expect(res.body.resource).toBe(createDto.resource);
        });
    });

    it('should return 400 for invalid data', () => {
      return request(app.getHttpServer())
        .post('/permissions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '' }) // Invalid data
        .expect(400);
    });
  });

  describe('/permissions/:id/roles (POST)', () => {
    it('should link roles to permission', async () => {
      // Create a permission first
      const permission = await permissionsRepository.save({
        name: 'test:permission',
        description: 'Test permission',
        resource: 'test',
        action: 'test',
      });

      const roleIds = ['role1', 'role2']; // Assuming these exist

      return request(app.getHttpServer())
        .post(`/permissions/${permission.id}/roles`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ roleIds })
        .expect(200);
    });
  });
});
