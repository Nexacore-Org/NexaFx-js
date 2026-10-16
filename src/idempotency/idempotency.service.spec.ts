import { IdempotencyKey } from './idempotency.entity';
import { IdempotencyService } from './idempotency.service';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

describe('IdempotencyService', () => {
  const repository = {
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const config = { get: jest.fn() };
  const service = new IdempotencyService(
    repository as unknown as Repository<IdempotencyKey>,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    // Mirror ConfigService: return the supplied default when nothing is configured.
    config.get.mockImplementation((_key: string, fallback?: unknown) => fallback);
  });

  it('hashes identical requests consistently', () => {
    const firstHash = service.hashRequest('POST', '/wallets', { amount: 10 });
    const secondHash = service.hashRequest('POST', '/wallets', {
      amount: 10,
    });
    const differentHash = service.hashRequest('GET', '/wallets', {
      amount: 10,
    });

    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toBe(differentHash);
  });

  it('finds a stored idempotency key', async () => {
    const key = {
      key: 'abc123',
    } as IdempotencyKey;

    repository.findOne.mockResolvedValue(key);

    await expect(service.findByKey('abc123')).resolves.toBe(key);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { key: 'abc123' },
    });
  });

  it('stores responses with an expiration window', async () => {
    const startedAt = Date.now();

    await service.store('abc123', 'hash', { ok: true }, 201, 2);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'abc123',
        requestHash: 'hash',
        response: { ok: true },
        statusCode: 201,
      }),
    );

    const saved = repository.save.mock.calls[0][0] as unknown as {
      expiresAt: Date;
    };
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(
      startedAt + 2 * 60 * 60 * 1000 - 1000,
    );
    expect(saved.expiresAt.getTime()).toBeLessThanOrEqual(
      startedAt + 2 * 60 * 60 * 1000 + 1000,
    );
  });

  it('defaults to a 24 hour expiration window', async () => {
    const startedAt = Date.now();

    await service.store('abc123', 'hash', { ok: true }, 201);

    const saved = repository.save.mock.calls[0][0] as unknown as {
      expiresAt: Date;
    };
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(
      startedAt + 24 * 60 * 60 * 1000 - 1000,
    );
    expect(saved.expiresAt.getTime()).toBeLessThanOrEqual(
      startedAt + 24 * 60 * 60 * 1000 + 1000,
    );
  });

  it('cleans up expired keys and returns the affected count', async () => {
    repository.delete.mockResolvedValue({ affected: 4 });

    await expect(service.cleanup()).resolves.toBe(4);
    const deleteArgs = repository.delete.mock.calls[0][0] as {
      expiresAt: unknown;
    };
    expect(deleteArgs.expiresAt).toBeDefined();
  });

  it('defaults to zero when the cleanup result has no affected count', async () => {
    repository.delete.mockResolvedValue({});

    await expect(service.cleanup()).resolves.toBe(0);
  });

  describe('store() TTL', () => {
    const hoursUntilExpiry = () => {
      const saved = repository.save.mock.calls[0][0] as { expiresAt: Date };
      return (saved.expiresAt.getTime() - Date.now()) / 3_600_000;
    };

    it('defaults to 24 hours', async () => {
      await service.store('k', 'h', {}, 201);
      expect(hoursUntilExpiry()).toBeGreaterThan(23.9);
      expect(hoursUntilExpiry()).toBeLessThan(24.1);
    });

    it('uses the configured idempotency.ttlHours', async () => {
      config.get.mockImplementation((key: string) => (key === 'idempotency.ttlHours' ? 6 : undefined));
      await service.store('k', 'h', {}, 201);
      expect(hoursUntilExpiry()).toBeGreaterThan(5.9);
      expect(hoursUntilExpiry()).toBeLessThan(6.1);
    });

    it('lets an explicit ttlHours argument win', async () => {
      config.get.mockImplementation(() => 6);
      await service.store('k', 'h', {}, 201, 2);
      expect(hoursUntilExpiry()).toBeGreaterThan(1.9);
      expect(hoursUntilExpiry()).toBeLessThan(2.1);
    });
  });
});
