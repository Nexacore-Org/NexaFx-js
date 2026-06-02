import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyKey } from './idempotency.entity';
import { TestDatabaseModule } from '../test/test-database.module';

describe('IdempotencyService (integration)', () => {
  let module: TestingModule;
  let service: IdempotencyService;
  let repo: Repository<IdempotencyKey>;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        TestDatabaseModule,
        TypeOrmModule.forFeature([IdempotencyKey]),
        ConfigModule.forRoot({ isGlobal: true }),
      ],
      providers: [IdempotencyService],
    }).compile();

    service = module.get(IdempotencyService);
    repo = module.get<Repository<IdempotencyKey>>(
      getRepositoryToken(IdempotencyKey),
    );
  });

  afterEach(async () => {
    await module.close();
  });

  it('stores a record and retrieves it by key', async () => {
    const key = 'integration-test-key-0001';
    const hash = service.hashRequest('POST', '/transfers', { amount: 100 });

    await service.store(key, hash, { id: 'tx-1' }, 201, 1);

    const found = await service.findByKey(key);
    expect(found).toBeDefined();
    expect(found!.key).toBe(key);
    expect(found!.requestHash).toBe(hash);
    expect(found!.statusCode).toBe(201);
    expect(found!.response).toEqual({ id: 'tx-1' });
  });

  it('returns null when key does not exist', async () => {
    const result = await service.findByKey('nonexistent-key-xyz');
    expect(result).toBeNull();
  });

  it('cleanup removes expired records and leaves valid ones', async () => {
    const expiredKey = 'expired-key-0001';
    const activeKey = 'active-key-0002';
    const hash = service.hashRequest('POST', '/transfers', {});

    const pastDate = new Date(Date.now() - 1000);
    await repo.save({
      key: expiredKey,
      requestHash: hash,
      response: {},
      statusCode: 200,
      expiresAt: pastDate,
    });

    await service.store(activeKey, hash, {}, 200, 24);

    const removed = await service.cleanup();
    expect(removed).toBeGreaterThanOrEqual(1);

    expect(await service.findByKey(expiredKey)).toBeNull();
    expect(await service.findByKey(activeKey)).not.toBeNull();
  });

  it('overwrites an existing record on duplicate store (upsert behaviour)', async () => {
    const key = 'dup-key-0001';
    const hash = service.hashRequest('POST', '/transfers', { amount: 50 });

    await service.store(key, hash, { id: 'tx-1' }, 201, 1);
    await service.store(key, hash, { id: 'tx-1', updated: true }, 201, 1);

    const rows = await repo.find({ where: { key } });
    expect(rows).toHaveLength(1);
    expect((rows[0].response as { updated?: boolean }).updated).toBe(true);
  });

  it('hashRequest produces the same hash for identical inputs', () => {
    const h1 = service.hashRequest('POST', '/transfers', { amount: 100 });
    const h2 = service.hashRequest('POST', '/transfers', { amount: 100 });
    expect(h1).toBe(h2);
  });

  it('hashRequest produces different hashes for different bodies', () => {
    const h1 = service.hashRequest('POST', '/transfers', { amount: 100 });
    const h2 = service.hashRequest('POST', '/transfers', { amount: 200 });
    expect(h1).not.toBe(h2);
  });
});
