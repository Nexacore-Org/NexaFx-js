import {
  Global,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { verify } from 'jsonwebtoken';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { ScheduledReportsController } from '../src/scheduled-reports/scheduled-reports.controller';
import {
  REPORT_GENERATORS,
  ScheduledReportsService,
} from '../src/scheduled-reports/scheduled-reports.service';
import { authHeader } from './helpers/auth';
import { setRequiredTestEnv } from './test-env';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) =>
          key === 'scheduledReports.maxActivePerUser' ? 5 : undefined,
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

function makeRepo() {
  const rows: StoredRow[] = [];
  return {
    rows,
    create: jest.fn(
      (dto: StoredRow): StoredRow => ({
        id: randomUUID(),
        createdAt: new Date(),
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
    remove: jest.fn((row: StoredRow): Promise<StoredRow> => {
      const index = rows.findIndex((candidate) => candidate.id === row.id);
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve(row);
    }),
  };
}

describe('Scheduled reports REST API (e2e)', () => {
  let app: INestApplication;
  let reports: ReturnType<typeof makeRepo>;
  let runs: ReturnType<typeof makeRepo>;

  beforeAll(async () => {
    setRequiredTestEnv();
    reports = makeRepo();
    runs = makeRepo();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestConfigModule],
      controllers: [ScheduledReportsController],
      providers: [
        {
          provide: REPORT_GENERATORS,
          useValue: [],
        },
        {
          provide: ScheduledReportsService,
          useFactory: (config: ConfigService, generators: any[]) =>
            new ScheduledReportsService(
              reports as any,
              runs as any,
              config,
              generators,
              { deliver: jest.fn().mockResolvedValue(undefined) } as any,
            ),
          inject: [ConfigService, REPORT_GENERATORS],
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

  it('creates, lists, and deactivates reports with ownership checks', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/scheduled-reports')
      .set('Authorization', owner())
      .send({ reportType: 'transaction_summary', frequency: 'daily' })
      .expect(201);

    expect(created.body).toMatchObject({
      userId: 'user-a',
      reportType: 'transaction_summary',
      isActive: true,
    });

    const listed = await request(app.getHttpServer())
      .get('/api/v1/scheduled-reports?page=1&limit=5')
      .set('Authorization', owner())
      .expect(200);
    expect(listed.body).toMatchObject({ page: 1, limit: 5 });
    expect(listed.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: 'user-a' })]),
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/scheduled-reports/${String(created.body.id)}/deactivate`)
      .set('Authorization', stranger())
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/scheduled-reports/${String(created.body.id)}/deactivate`)
      .set('Authorization', owner())
      .expect(200);

    expect(
      reports.rows.find((row) => row.id === created.body.id)?.isActive,
    ).toBe(false);
  });

  it("lists runs only for the caller's report", async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/scheduled-reports')
      .set('Authorization', owner())
      .send({ reportType: 'portfolio', frequency: 'weekly' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/scheduled-reports/${String(created.body.id)}/runs`)
      .set('Authorization', owner())
      .expect(200);
    expect(response.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });

    await request(app.getHttpServer())
      .get(`/api/v1/scheduled-reports/${String(created.body.id)}/runs`)
      .set('Authorization', stranger())
      .expect(404);
  });
});
