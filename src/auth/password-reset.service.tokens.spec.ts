import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PasswordResetService } from './password-reset.service';

/** Issue #1538: token lifecycle against an in-memory repository, with fake timers. */
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

function build() {
  const rows: any[] = [];
  let seq = 0;
  const repo: any = {
    delete: jest.fn(async (where: any) => {
      let n = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        const hit = typeof where === 'string' ? r.id === where : Object.entries(where).every(([k, v]) => r[k] === v);
        if (hit) {
          rows.splice(i, 1);
          n++;
        }
      }
      return { affected: n };
    }),
    create: (v: any) => ({ id: `t${++seq}`, attempts: 0, used: false, createdAt: new Date(), ...v }),
    save: jest.fn(async (v: any) => {
      rows.push(v);
      return v;
    }),
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.tokenHash === where.tokenHash) ?? null),
    update: jest.fn(async (where: any, patch: any) => {
      const hit = rows.filter((r) => (typeof where === 'string' ? r.id === where : Object.entries(where).every(([k, v]) => r[k] === v)));
      hit.forEach((r) => Object.assign(r, patch));
      return { affected: hit.length };
    }),
  };
  return { service: new PasswordResetService(repo), rows, repo };
}

describe('PasswordResetService token lifecycle (issue #1538)', () => {
  afterEach(() => jest.useRealTimers());

  it('stores only a hash of the token and expires it after 15 minutes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { service, rows } = build();

    const raw = await service.createResetToken('u1');

    expect(rows[0].tokenHash).toBe(sha(raw));
    expect(rows[0].tokenHash).not.toBe(raw);
    expect(rows[0].expiresAt.getTime() - Date.now()).toBe(15 * 60 * 1000);
  });

  it('an expired token is refused and its row deleted', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { service, rows } = build();
    const raw = await service.createResetToken('u1');

    jest.setSystemTime(new Date('2026-01-01T00:16:00Z'));

    await expect(service.validateToken(raw)).rejects.toThrow('Reset token has expired');
    expect(rows).toHaveLength(0);
  });

  it('allows three validations and deletes the token on the fourth attempt', async () => {
    const { service, rows } = build();
    const raw = await service.createResetToken('u1');

    for (let i = 0; i < 3; i++) await expect(service.validateToken(raw)).resolves.toBe('u1');
    await expect(service.validateToken(raw)).rejects.toThrow('Too many attempts');

    expect(rows).toHaveLength(0);
  });

  it('creating a new token invalidates the previous unused one', async () => {
    const { service, rows } = build();
    const first = await service.createResetToken('u1');
    const second = await service.createResetToken('u1');

    expect(rows).toHaveLength(1);
    await expect(service.validateToken(first)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.validateToken(second)).resolves.toBe('u1');
  });

  it('consumeToken marks the token used, and a used token is refused', async () => {
    const { service } = build();
    const raw = await service.createResetToken('u1');

    await service.consumeToken(raw);

    await expect(service.validateToken(raw)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('an unknown token is a 404', async () => {
    const { service } = build();
    await expect(service.validateToken('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
