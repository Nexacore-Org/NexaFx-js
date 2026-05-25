import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoalsModule } from '../src/goals/goal.module';
import { Goal } from '../src/goals/entities/goal.entity';
import { GoalContribution } from '../src/goals/entities/goal-contribution.entity';

describe('Goals (e2e)', () => {
  let app: INestApplication;
  let createdGoalId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Goal, GoalContribution],
          synchronize: true,
        }),
        GoalsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /goals — creates a goal with progressPercentage', async () => {
    const res = await request(app.getHttpServer())
      .post('/goals')
      .send({
        title: 'Emergency Fund',
        targetAmount: 1000,
        currency: 'USD',
        deadline: new Date(Date.now() + 86400000 * 30).toISOString(),
      })
      .expect(201);

    expect(res.body.title).toBe('Emergency Fund');
    expect(res.body.progressPercentage).toBeDefined();
    expect(res.body.progressPercentage).toBe(0);
    createdGoalId = res.body.id;
  });

  it('GET /goals — returns list with summary', async () => {
    const res = await request(app.getHttpServer()).get('/goals').expect(200);
    expect(res.body.goals).toBeInstanceOf(Array);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.active).toBeGreaterThanOrEqual(1);
  });

  it('GET /goals/:id — returns the goal', async () => {
    const res = await request(app.getHttpServer())
      .get(`/goals/${createdGoalId}`)
      .expect(200);
    expect(res.body.id).toBe(createdGoalId);
  });

  it('GET /goals/:id — returns 404 for unknown id', async () => {
    await request(app.getHttpServer())
      .get('/goals/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('PATCH /goals/:id — updates fields and recalculates progressPercentage', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/goals/${createdGoalId}`)
      .send({ currentAmount: 500 })
      .expect(200);

    expect(res.body.progressPercentage).toBe(50);
  });

  it('PATCH /goals/:id/progress — adds amount to progress', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/goals/${createdGoalId}/progress`)
      .send({ amount: 250 })
      .expect(200);

    expect(Number(res.body.progressPercentage)).toBeGreaterThanOrEqual(75);
  });

  it('PATCH /goals/:id/complete — marks goal complete when target reached', async () => {
    // First set currentAmount to target
    await request(app.getHttpServer())
      .patch(`/goals/${createdGoalId}`)
      .send({ currentAmount: 1000 });

    const res = await request(app.getHttpServer())
      .patch(`/goals/${createdGoalId}/complete`)
      .expect(200);

    expect(res.body.isCompleted).toBe(true);
  });

  it('DELETE /goals/:id — soft-deletes and returns 204', async () => {
    // Create a new goal to delete
    const createRes = await request(app.getHttpServer())
      .post('/goals')
      .send({ title: 'To Delete', targetAmount: 100 })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/goals/${createRes.body.id}`)
      .expect(204);
  });
});
