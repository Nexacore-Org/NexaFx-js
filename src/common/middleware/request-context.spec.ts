import { Controller, Get, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { Writable } from 'stream';
import request from 'supertest';
import { correlationPinoOptions } from '../logging/correlation-pino';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { TimeoutMiddleware } from './timeout.middleware';
import { getCorrelationId } from './correlation-id.storage';

@Controller('probe')
class ProbeController {
  @Get('id')
  id() {
    return { seen: getCorrelationId() };
  }

  @Get('slow')
  async slow() {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { ok: true };
  }
}

const logLines: string[] = [];
const sink = new Writable({
  write(chunk, _enc, cb) {
    logLines.push(chunk.toString());
    cb();
  },
});

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: [{ level: 'info', ...correlationPinoOptions }, sink] })],
  controllers: [ProbeController],
})
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, TimeoutMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}

describe('request context middleware (issue #1546)', () => {
  let app: INestApplication;
  const originalTimeout = process.env.REQUEST_TIMEOUT_MS;

  beforeAll(async () => {
    process.env.REQUEST_TIMEOUT_MS = '100';
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalTimeout === undefined) delete process.env.REQUEST_TIMEOUT_MS;
    else process.env.REQUEST_TIMEOUT_MS = originalTimeout;
  });

  it('echoes a well-formed client correlation id and exposes it to handlers', async () => {
    const res = await request(app.getHttpServer()).get('/probe/id').set('x-correlation-id', 'client-id-12345');

    expect(res.headers['x-correlation-id']).toBe('client-id-12345');
    expect(res.body.seen).toBe('client-id-12345');
  });

  it('replaces a malformed client id with a generated UUID', async () => {
    const res = await request(app.getHttpServer()).get('/probe/id').set('x-correlation-id', 'bad id\nwith newline');

    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('puts the same id on the access log line', async () => {
    logLines.length = 0;
    await request(app.getHttpServer()).get('/probe/id').set('x-correlation-id', 'log-trace-0001');

    expect(logLines.some((line) => line.includes('log-trace-0001'))).toBe(true);
  });

  it('answers 504 when a handler exceeds the timeout', async () => {
    const res = await request(app.getHttpServer()).get('/probe/slow').set('x-correlation-id', 'timeout-id-001');

    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({ statusCode: 504, correlationId: 'timeout-id-001' });
  });
});
