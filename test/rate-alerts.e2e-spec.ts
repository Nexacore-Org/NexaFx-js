import {
  Global,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { verify } from 'jsonwebtoken';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { CurrenciesService } from '../src/currencies/currencies.service';
import { RateAlertsController } from '../src/rate-alerts/rate-alerts.controller';
import { RateAlertsService } from '../src/rate-alerts/rate-alerts.service';
import { authHeader } from './helpers/auth';
import { setRequiredTestEnv } from './test-env';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) => (key === 'rateAlerts.maxPerUser' ? 5 : undefined),
      },
    },
  ],
  exports: [ConfigService],
})
class TestConfigModule {}

type StoredRow = Record<string, unknown>;

interface FindOptions {
  where: StoredRow;
  skip?: number;
  take?: number;
}

function matches(row: StoredRow, where: StoredRow) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function makeAlertRepo() {
  const rows: StoredRow[] = [];
  return {
    rows,
    create: jest.fn(
      (dto: StoredRow): StoredRow => ({
        id: randomUUID(),
        createdAt: new Date(),
        triggeredAt: null,
        deactivatedAt: null,
        ...dto,
      }),
    ),
    save: jest.fn((row: StoredRow): Promise<StoredRow> => {
      const index = rows.findIndex((candidate) => candidate.id === row.id);
      if (index >= 0) rows[index] = row;
      else rows.push(row);
      return Promise.resolve(row);
    }),
    count: jest.fn(
      ({ where }: { where: StoredRow }): Promise<number> =>
        Promise.resolve(rows.filter((row) => matches(row, where)).length),
    ),
    findOne: jest.fn(
      ({ where }: { where: StoredRow }): Promise<StoredRow | null> =>
        Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
    ),
    findAndCount: jest.fn(
      ({
        where,
        skip = 0,
        take,
      }: FindOptions): Promise<[StoredRow[], number]> => {
        const filtered = rows.filter((row) => matches(row, where));
        return Promise.resolve([
          filtered.slice(skip, skip + (take ?? filtered.length)),
          filtered.length,
        ]);
      },
    ),
  };
}

describe('Rate alerts REST API (e2e)', () => {
  let app: INestApplication;
  let repo: ReturnType<typeof makeAlertRepo>;

  beforeAll(async () => {
    setRequiredTestEnv();
    repo = makeAlertRepo();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestConfigModule],
      controllers: [RateAlertsController],
      providers: [
        {
          provide: RateAlertsService,
          useFactory: (config: ConfigService) =>
            new RateAlertsService(
              repo as any,
              { emit: jest.fn() } as unknown as EventEmitter2,
              config,
              {
                validateCurrencyActive: jest.fn(),
              } as unknown as CurrenciesService,
            ),
          inject: [ConfigService],
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest() as {
            headers: { authorization?: string };
            user?: unknown;
          };
          const token = String(req.headers.authorization ?? '').replace(
            /^Bearer /,
            '',
          );
          const payload = verify(token, process.env.JWT_SECRET as string) as {
            sub: string;
          };
          req.user = { sub: payload.sub, id: payload.sub };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const owner = () => authHeader('USER', { sub: 'user-a' });
  const stranger = () => authHeader('USER', { sub: 'user-b' });

  it('POST /api/v1/rate-alerts creates an alert for the token user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-alerts')
      .set('Authorization', owner())
      .send({ currencyPair: 'USD/NGN', targetRate: 1500, direction: 'above' })
      .expect(201);

    expect(response.body).toMatchObject({
      userId: 'user-a',
      currencyPair: 'USD/NGN',
      direction: 'above',
      triggered: false,
      isActive: true,
    });
  });

  it('rejects an unsupported pair', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/rate-alerts')
      .set('Authorization', owner())
      .send({ currencyPair: 'XXX/YYY', targetRate: 1, direction: 'above' })
      .expect(400);
  });

  it("GET /api/v1/rate-alerts returns only the caller's paginated alerts", async () => {
    await request(app.getHttpServer())
      .post('/api/v1/rate-alerts')
      .set('Authorization', stranger())
      .send({ currencyPair: 'USD/EUR', targetRate: 1, direction: 'below' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/rate-alerts?page=1&limit=5')
      .set('Authorization', owner())
      .expect(200);

    expect(response.body).toMatchObject({ page: 1, limit: 5 });
    expect(response.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: 'user-a' })]),
    );
    expect(response.body.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: 'user-b' })]),
    );
  });

  it('DELETE /api/v1/rate-alerts/:id is ownership scoped', async () => {
    const foreign = repo.rows.find((row) => row.userId === 'user-b');
    expect(foreign).toBeDefined();

    await request(app.getHttpServer())
      .delete(`/api/v1/rate-alerts/${String(foreign!.id)}`)
      .set('Authorization', owner())
      .expect(404);

    const own = repo.rows.find(
      (row) => row.userId === 'user-a' && row.isActive,
    );
    expect(own).toBeDefined();

    await request(app.getHttpServer())
      .delete(`/api/v1/rate-alerts/${String(own!.id)}`)
      .set('Authorization', owner())
      .expect(204);

    expect(own!.isActive).toBe(false);
    expect(own!.deactivatedAt).toBeTruthy();
  });
});
