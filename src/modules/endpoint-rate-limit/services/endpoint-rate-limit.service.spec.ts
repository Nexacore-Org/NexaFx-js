import { EndpointRateLimitService } from './endpoint-rate-limit.service';

/**
 * In-memory stand-in for the shared Redis store. It honours the script's
 * contract (KEYS[1] bucket, ARGV now/window/max/member) so two service
 * instances pointed at the same store behave like two app instances.
 */
class FakeRedis {
  private readonly buckets = new Map<string, number[]>();

  async eval(
    _script: string,
    _numKeys: number,
    key: string,
    now: number,
    windowMs: number,
    maxRequests: number,
  ): Promise<[number, number, number]> {
    const live = (this.buckets.get(key) ?? []).filter((ts) => ts > now - windowMs);
    if (live.length >= maxRequests) {
      this.buckets.set(key, live);
      return [0, 0, live[0]];
    }
    live.push(now);
    this.buckets.set(key, live);
    return [1, maxRequests - live.length, 0];
  }
}

const config = { endpoint: '/api/v1/auth/login', method: 'POST', maxRequests: 2, windowMs: 60_000, isActive: true };

const makeService = (redis: FakeRedis) =>
  new EndpointRateLimitService(
    { findOne: jest.fn().mockResolvedValue(config) } as any,
    redis as any,
  );

describe('EndpointRateLimitService.checkRateLimit', () => {
  it("does not let one client's burst lock out a different client", async () => {
    const svc = makeService(new FakeRedis());

    expect((await svc.checkRateLimit(config.endpoint, 'POST', 'ip:1.1.1.1')).allowed).toBe(true);
    expect((await svc.checkRateLimit(config.endpoint, 'POST', 'ip:1.1.1.1')).allowed).toBe(true);
    const blocked = await svc.checkRateLimit(config.endpoint, 'POST', 'ip:1.1.1.1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    const other = await svc.checkRateLimit(config.endpoint, 'POST', 'ip:2.2.2.2');
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(1);
  });

  it('enforces the limit across separate service instances sharing the store', async () => {
    const shared = new FakeRedis();
    const instanceA = makeService(shared);
    const instanceB = makeService(shared);

    await instanceA.checkRateLimit(config.endpoint, 'POST', 'user:abc');
    await instanceB.checkRateLimit(config.endpoint, 'POST', 'user:abc');

    expect((await instanceA.checkRateLimit(config.endpoint, 'POST', 'user:abc')).allowed).toBe(false);
  });
});
