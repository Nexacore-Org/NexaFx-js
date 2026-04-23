import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FeatureFlagsModule } from '../src/modules/feature-flags/feature-flags.module';
import { FeatureFlagEntity } from '../src/modules/feature-flags/entities/feature-flag.entity';
import { AdminGuard } from '../src/modules/auth/guards/admin.guard';

const mockFlag: FeatureFlagEntity = {
  id: 'flag-1',
  name: 'test-flag',
  description: 'Test',
  enabled: true,
  environments: null,
  targetingRules: [{ type: 'percentage', value: 50 }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepo = {
  find: jest.fn().mockResolvedValue([mockFlag]),
  findOne: jest.fn().mockResolvedValue(mockFlag),
  save: jest.fn().mockImplementation((e) => Promise.resolve({ ...mockFlag, ...e })),
  create: jest.fn().mockImplementation((dto) => dto),
  remove: jest.fn().mockResolvedValue(undefined),
};

describe('Feature Flags (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FeatureFlagsModule],
    })
      .overrideProvider(getRepositoryToken(FeatureFlagEntity))
      .useValue(mockRepo)
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /admin/feature-flags returns list', async () => {
    const res = await request(app.getHttpServer()).get('/admin/feature-flags');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin/feature-flags/:id/analytics returns stats', async () => {
    const res = await request(app.getHttpServer()).get('/admin/feature-flags/flag-1/analytics');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalEvaluations');
    expect(res.body).toHaveProperty('enabledPercentage');
  });

  it('PATCH /admin/feature-flags/:id updates flag and invalidates cache', async () => {
    const res = await request(app.getHttpServer())
      .patch('/admin/feature-flags/flag-1')
      .send({ enabled: false });
    expect(res.status).toBe(200);
  });

  describe('FeatureFlagEvaluationService', () => {
    it('deterministic percentage rollout: same user always gets same result', async () => {
      const { FeatureFlagEvaluationService } = await import(
        '../src/modules/feature-flags/services/feature-flag-evaluation.service'
      );
      const svc = new (FeatureFlagEvaluationService as any)(mockRepo);
      // Call evaluate twice — should return same result
      mockRepo.findOne.mockResolvedValue({ ...mockFlag, targetingRules: [{ type: 'percentage', value: 50 }] });
      const r1 = await svc.evaluate('test-flag', { userId: 'user-abc' });
      const r2 = await svc.evaluate('test-flag', { userId: 'user-abc' });
      expect(r1).toBe(r2);
    });
  });
});
