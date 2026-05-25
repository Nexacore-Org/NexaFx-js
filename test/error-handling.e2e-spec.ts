import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { RequestContextService } from '../../src/common/context/request-context.service';
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';

class TestDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

@Controller('test-errors')
class TestErrorController {
  @Get('401')
  throw401() { throw new UnauthorizedException({ code: 'AUTH_001', message: 'No token' }); }

  @Get('403')
  throw403() { throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' }); }

  @Get('404')
  throw404() { throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' }); }

  @Get('500')
  throw500() { throw new Error('Unexpected error'); }

  @Post('400')
  throw400(@Body() dto: TestDto) { return dto; }
}

describe('Error Handling E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TestErrorController],
      providers: [
        RequestContextService,
        {
          provide: 'ErrorAnalytics',
          useValue: { recordError: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    const ctx = app.get(RequestContextService);
    app.useGlobalFilters(new GlobalExceptionFilter(ctx));
    await app.init();
  });

  afterAll(() => app.close());

  const expectStandardShape = (body: any) => {
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('correlationId');
  };

  it('400 validation error has field-level details', async () => {
    const res = await request(app.getHttpServer()).post('/test-errors/400').send({}).expect(400);
    expectStandardShape(res.body);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details[0]).toHaveProperty('field');
    expect(res.body.details[0]).toHaveProperty('errors');
  });

  it('401 returns standard shape with AUTH code', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/401').expect(401);
    expectStandardShape(res.body);
    expect(res.body.code).toBe('AUTH_001');
  });

  it('403 returns standard shape', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/403').expect(403);
    expectStandardShape(res.body);
  });

  it('404 returns standard shape', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/404').expect(404);
    expectStandardShape(res.body);
  });

  it('500 returns standard shape without stack trace in non-dev', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/500').expect(500);
    expectStandardShape(res.body);
    expect(res.body.stack).toBeUndefined();
  });
});
