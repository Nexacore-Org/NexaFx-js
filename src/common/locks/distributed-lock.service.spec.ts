import { DistributedLockService } from './distributed-lock.service';

/** Minimal in-memory stand-in for the ioredis calls the lock uses. */
class FakeRedis {
  store = new Map<string, { value: string; expiresAt: number }>();
  now = 0;

  private live(key: string) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt <= this.now) this.store.delete(key);
    return this.store.get(key);
  }

  async set(key: string, value: string, _px: 'PX', ttl: number, _nx: 'NX') {
    if (this.live(key)) return null;
    this.store.set(key, { value, expiresAt: this.now + ttl });
    return 'OK';
  }

  async eval(_script: string, _n: number, key: string, token: string) {
    const entry = this.live(key);
    if (entry && entry.value === token) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}

describe('DistributedLockService (issue #1550)', () => {
  it('lets only one of two concurrent callers run', async () => {
    const redis = new FakeRedis();
    const a = new DistributedLockService(redis as any);
    const b = new DistributedLockService(redis as any); // a second "instance" on the same Redis

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const bodyA = jest.fn(() => gate.then(() => 'a'));
    const bodyB = jest.fn(async () => 'b');

    const first = a.runExclusive('job', 1000, bodyA);
    await Promise.resolve();
    const second = await b.runExclusive('job', 1000, bodyB);
    release();
    const firstResult = await first;

    expect(second).toEqual({ ran: false });
    expect(bodyB).not.toHaveBeenCalled();
    expect(firstResult).toEqual({ ran: true, result: 'a' });
  });

  it('releases the lock after the body so the next tick can run', async () => {
    const redis = new FakeRedis();
    const svc = new DistributedLockService(redis as any);

    await svc.runExclusive('job', 1000, async () => 1);
    const next = await svc.runExclusive('job', 1000, async () => 2);

    expect(next).toEqual({ ran: true, result: 2 });
  });

  it('releases the lock and rethrows when the body fails', async () => {
    const redis = new FakeRedis();
    const svc = new DistributedLockService(redis as any);

    await expect(svc.runExclusive('job', 1000, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(svc.runExclusive('job', 1000, async () => 'ok')).resolves.toEqual({ ran: true, result: 'ok' });
  });

  it('lets a crashed holder expire after the TTL', async () => {
    const redis = new FakeRedis();
    const svc = new DistributedLockService(redis as any);
    await redis.set('lock:cluster:job', 'crashed-instance-token', 'PX', 1000, 'NX');

    expect(await svc.runExclusive('job', 1000, async () => 'x')).toEqual({ ran: false });
    redis.now += 1001;
    expect(await svc.runExclusive('job', 1000, async () => 'x')).toEqual({ ran: true, result: 'x' });
  });

  it("does not release another holder's lock (token mismatch is a no-op)", async () => {
    const redis = new FakeRedis();
    const svc = new DistributedLockService(redis as any);

    // Our lock expires mid-run and another instance takes the key.
    await svc.runExclusive('job', 1000, async () => {
      redis.now += 1001;
      await redis.set('lock:cluster:job', 'other-token', 'PX', 1000, 'NX');
    });

    expect(redis.store.get('lock:cluster:job')?.value).toBe('other-token');
  });

  it('falls back to a Postgres advisory lock when Redis errors', async () => {
    const redis = { set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')), eval: jest.fn() };
    const runner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest.fn().mockResolvedValue([{ locked: true }]),
    };
    const ds = { createQueryRunner: jest.fn().mockReturnValue(runner) };
    const svc = new DistributedLockService(redis as any, ds as any);

    const result = await svc.runExclusive('job', 1000, async () => 'ran');

    expect(result).toEqual({ ran: true, result: 'ran' });
    expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_lock'), expect.any(Array));
    expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'), expect.any(Array));
    expect(runner.release).toHaveBeenCalled();
  });

  it('skips the body when the Postgres advisory lock is held elsewhere', async () => {
    const runner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest.fn().mockResolvedValue([{ locked: false }]),
    };
    const svc = new DistributedLockService(undefined, { createQueryRunner: () => runner } as any);
    const body = jest.fn();

    expect(await svc.runExclusive('job', 1000, body)).toEqual({ ran: false });
    expect(body).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });
});
