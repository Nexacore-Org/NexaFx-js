import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { OtpService } from './otp.service';
import { OtpPurpose } from './otp.entity';

const SECRET = 'x'.repeat(32);

/** Small in-memory otps table with the atomic operations the service relies on. */
function build(secret: string | undefined = SECRET) {
  const rows: any[] = [];
  const maxOf = (params: any) => params.max;

  const repo = {
    create: jest.fn((v) => ({ id: `otp-${rows.length + 1}`, attempts: 0, usedAt: null, createdAt: new Date(), ...v })),
    save: jest.fn(async (v) => { rows.push(v); return v; }),
    delete: jest.fn(async () => { rows.length = 0; }),
    findOne: jest.fn(async () => rows[rows.length - 1] ?? null),
    update: jest.fn(async (where: any, patch: any) => {
      const row = rows.find((r) => r.id === where.id);
      // `usedAt: IsNull()` is a FindOperator; any operator means "only if still unused".
      if (!row || (where.usedAt && row.usedAt)) return { affected: 0 };
      Object.assign(row, patch);
      return { affected: 1 };
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {};
      let params: any;
      qb.update = () => qb;
      qb.set = () => qb;
      qb.where = (_sql: string, p: any) => { params = p; return qb; };
      qb.execute = async () => {
        const row = rows.find((r) => r.id === params.id);
        if (!row || row.usedAt || row.attempts >= maxOf(params)) return { affected: 0 };
        row.attempts += 1; // the database performs this increment atomically
        return { affected: 1 };
      };
      return qb;
    }),
  };
  const config = { get: jest.fn((k: string) => (k === 'otp.secret' ? secret : k === 'otp.expiry' ? 300 : undefined)) };
  const mail = { sendVerificationOtp: jest.fn() };
  const service = new OtpService(repo as any, config as any, mail as any);
  return { service, repo, rows, mail };
}

async function issue(ctx: ReturnType<typeof build>) {
  await ctx.service.generate('u1', OtpPurpose.EMAIL_VERIFY, 'a@b.c');
  return ctx.mail.sendVerificationOtp.mock.calls[0][1] as string;
}

describe('OtpService', () => {
  it('refuses to start without a strong secret', () => {
    expect(() => build(undefined)).toThrow(/OTP_SECRET/);
    expect(() => build('short')).toThrow(/OTP_SECRET/);
  });

  it('stores the HMAC of the code, never the code, and emails the code', async () => {
    const ctx = build();
    const code = await issue(ctx);
    expect(code).toMatch(/^\d{6}$/);
    expect(ctx.rows[0].codeHash).toBe(createHmac('sha256', SECRET).update(code).digest('hex'));
    expect(JSON.stringify(ctx.rows[0])).not.toContain(code);
  });

  it('verifies a correct code once, then rejects reuse', async () => {
    const ctx = build();
    const code = await issue(ctx);
    await expect(ctx.service.verify('u1', code, OtpPurpose.EMAIL_VERIFY)).resolves.toBe(true);
    await expect(ctx.service.verify('u1', code, OtpPurpose.EMAIL_VERIFY)).rejects.toThrow('OTP already used');
  });

  it('returns false for a wrong code and counts the attempt', async () => {
    const ctx = build();
    const code = await issue(ctx);
    const wrong = code === '111111' ? '222222' : '111111';
    await expect(ctx.service.verify('u1', wrong, OtpPurpose.EMAIL_VERIFY)).resolves.toBe(false);
    expect(ctx.rows[0].attempts).toBe(1);
  });

  it('rejects an expired code', async () => {
    const ctx = build();
    const code = await issue(ctx);
    ctx.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(ctx.service.verify('u1', code, OtpPurpose.EMAIL_VERIFY)).rejects.toThrow('OTP expired');
  });

  it('locks after 5 wrong attempts even for the correct code', async () => {
    const ctx = build();
    const code = await issue(ctx);
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i += 1) {
      await expect(ctx.service.verify('u1', wrong, OtpPurpose.EMAIL_VERIFY)).resolves.toBe(false);
    }
    await expect(ctx.service.verify('u1', code, OtpPurpose.EMAIL_VERIFY)).rejects.toThrow('Max OTP attempts exceeded');
  });

  it('bounds parallel guesses: only 5 of 20 concurrent attempts are even evaluated', async () => {
    const ctx = build();
    const code = await issue(ctx);
    const wrong = code === '123456' ? '654321' : '123456';
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => ctx.service.verify('u1', wrong, OtpPurpose.EMAIL_VERIFY)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(15);
    expect(ctx.rows[0].attempts).toBe(5);
  });

  it('lets exactly one of two concurrent correct verifications succeed', async () => {
    const ctx = build();
    const code = await issue(ctx);
    const results = await Promise.allSettled([
      ctx.service.verify('u1', code, OtpPurpose.EMAIL_VERIFY),
      ctx.service.verify('u1', code, OtpPurpose.EMAIL_VERIFY),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled' && (r as any).value === true)).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    expect(failure?.reason).toBeInstanceOf(UnauthorizedException);
  });

  it('can generate every value from 000000 to 999999 (zero-padded)', () => {
    const { service } = build();
    const spy = jest.spyOn(require('crypto'), 'randomInt');
    spy.mockReturnValueOnce(7).mockReturnValueOnce(999_999);
    expect((service as any).randomSixDigit()).toBe('000007');
    expect((service as any).randomSixDigit()).toBe('999999');
    expect(spy).toHaveBeenCalledWith(0, 1_000_000);
    spy.mockRestore();
  });
});
