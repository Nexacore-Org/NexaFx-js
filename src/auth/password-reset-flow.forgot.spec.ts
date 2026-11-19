import { PasswordResetFlowService, FORGOT_PASSWORD_RESPONSE } from './password-reset-flow.service';
import { PasswordResetRateLimiter } from './password-reset-rate-limiter';

/** Issue #1527: per-email limit, timing parity, cooldown, audit. */
function build(over: { allow?: boolean; recent?: boolean; user?: any; queue?: any | null } = {}) {
  const user = over.user === undefined ? { id: 'u1', email: 'victim@example.com', isActive: true } : over.user;
  const usersService = { findByEmail: jest.fn().mockResolvedValue(user) };
  const resetService = {
    hasRecentActiveToken: jest.fn().mockResolvedValue(over.recent ?? false),
    createResetToken: jest.fn().mockResolvedValue('raw-token'),
  };
  const mailService = { sendPasswordResetLink: jest.fn().mockResolvedValue(undefined) };
  const limiter = { allow: jest.fn().mockResolvedValue(over.allow ?? true) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const queue = over.queue === null ? undefined : (over.queue ?? { add: jest.fn().mockResolvedValue({ id: 'job-1' }) });
  const service = new PasswordResetFlowService(
    usersService as any,
    resetService as any,
    {} as any,
    {} as any,
    mailService as any,
    {} as any,
    { get: jest.fn().mockReturnValue('https://app.example.com') } as any,
    limiter as any,
    audit as any,
    queue as any,
  );
  return { service, usersService, resetService, mailService, limiter, audit, queue };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('PasswordResetFlowService.forgotPassword (issue #1527)', () => {
  it('returns the generic response and does no lookup once the per-email limit is hit', async () => {
    const { service, usersService, resetService } = build({ allow: false });

    await expect(service.forgotPassword('victim@example.com')).resolves.toBe(FORGOT_PASSWORD_RESPONSE);

    expect(usersService.findByEmail).not.toHaveBeenCalled();
    expect(resetService.createResetToken).not.toHaveBeenCalled();
  });

  it('does not wait for the queue or SMTP: a hung mail path cannot slow the existing-user response', async () => {
    const queue = { add: jest.fn(() => new Promise(() => undefined)) };
    const { service } = build({ queue });

    const outcome = await Promise.race([
      service.forgotPassword('victim@example.com'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 200)),
    ]);

    expect(outcome).toBe(FORGOT_PASSWORD_RESPONSE);
  });

  it('existing and unknown emails return the identical response', async () => {
    const existing = await build().service.forgotPassword('victim@example.com');
    const unknown = await build({ user: null }).service.forgotPassword('nobody@example.com');

    expect(existing).toEqual(unknown);
  });

  it('queues the mail on the email queue instead of calling SMTP directly', async () => {
    const { service, queue, mailService } = build();

    await service.forgotPassword('victim@example.com');
    await flush();

    expect(queue.add).toHaveBeenCalledWith(
      'password-reset',
      expect.objectContaining({ to: 'victim@example.com', resetUrl: expect.stringContaining('token=raw-token') }),
    );
    expect(mailService.sendPasswordResetLink).not.toHaveBeenCalled();
  });

  it('falls back to a detached direct send when no queue is available', async () => {
    const { service, mailService } = build({ queue: null });

    await service.forgotPassword('victim@example.com');
    await flush();

    expect(mailService.sendPasswordResetLink).toHaveBeenCalledWith('victim@example.com', expect.any(String));
  });

  it('keeps the existing link when one was issued inside the cooldown (no invalidation, no new mail)', async () => {
    const { service, resetService, queue, audit } = build({ recent: true });

    await service.forgotPassword('victim@example.com');
    await flush();

    expect(resetService.createResetToken).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ outcome: 'reused_existing_link' }) }),
    );
  });

  it('writes an audit entry with a hashed email, never the address', async () => {
    const { service, audit } = build();

    await service.forgotPassword('victim@example.com');
    await flush();

    const entry = audit.log.mock.calls[0][0];
    expect(entry.action).toBe('auth.password_reset_requested');
    expect(entry.after.emailHash).toBe(PasswordResetRateLimiter.hashEmail('victim@example.com'));
    expect(JSON.stringify(entry)).not.toContain('victim@example.com');
  });

  it('does nothing for a suspended account but still answers generically', async () => {
    const { service, resetService } = build({ user: { id: 'u1', email: 'x@y.z', isActive: false } });

    await expect(service.forgotPassword('x@y.z')).resolves.toBe(FORGOT_PASSWORD_RESPONSE);
    await flush();
    expect(resetService.createResetToken).not.toHaveBeenCalled();
  });
});

describe('PasswordResetRateLimiter (issue #1527)', () => {
  const redis = (counts: number[]) => {
    let i = 0;
    return { incr: jest.fn(async () => counts[i++]), pexpire: jest.fn().mockResolvedValue(1) };
  };

  it('allows three requests per email per window and blocks the fourth', async () => {
    const r = redis([1, 2, 3, 4]);
    const limiter = new PasswordResetRateLimiter(r as any);

    const results = [];
    for (let n = 0; n < 4; n++) results.push(await limiter.allow('Victim@Example.com'));

    expect(results).toEqual([true, true, true, false]);
    expect(r.pexpire).toHaveBeenCalledTimes(1); // only on the first hit
  });

  it('keys on a case-insensitive hash, not the address', async () => {
    const r = redis([1]);
    await new PasswordResetRateLimiter(r as any).allow('Victim@Example.com');
    const key = (r.incr.mock.calls[0] as unknown[])[0] as string;
    expect(key).toBe(`rl:pwreset:${PasswordResetRateLimiter.hashEmail('victim@example.com')}`);
    expect(key).not.toContain('victim');
  });

  it('fails open when Redis errors or is absent', async () => {
    const broken = { incr: jest.fn().mockRejectedValue(new Error('down')), pexpire: jest.fn() };
    await expect(new PasswordResetRateLimiter(broken as any).allow('a@b.c')).resolves.toBe(true);
    await expect(new PasswordResetRateLimiter(undefined).allow('a@b.c')).resolves.toBe(true);
  });
});
