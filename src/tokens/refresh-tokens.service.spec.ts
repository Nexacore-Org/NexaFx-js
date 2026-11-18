import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokensService } from './refresh-tokens.service';
import { RefreshToken } from '../auth/refresh-token.entity';

/** Issue #1538: an in-memory repository fake behind the real service. */
function build() {
  const rows: RefreshToken[] = [];
  const matches = (r: any, where: any) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && '_type' in (v as object)) {
        const op = v as { _type: string; _value: any };
        if (op._type === 'isNull') return r[k] === null || r[k] === undefined;
        if (op._type === 'not') return r[k] !== op._value;
        if (op._type === 'lessThan') return r[k] < op._value;
      }
      return r[k] === v;
    });
  const repo: any = {
    create: (v: any) => ({ revokedAt: null, replacedByTokenId: null, parentTokenId: null, ...v }),
    save: jest.fn(async (v: any) => {
      for (const item of Array.isArray(v) ? v : [v]) {
        const i = rows.findIndex((r) => r.id === item.id);
        if (i === -1) rows.push(item);
        else rows[i] = item;
      }
      return v;
    }),
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    find: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))),
    update: jest.fn(async (where: any, patch: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, patch));
      return { affected: hit.length };
    }),
    delete: jest.fn(async () => ({ affected: 0 })),
  };
  repo.manager = { transaction: async (cb: any) => cb({
    findOne: (_e: unknown, o: any) => repo.findOne(o),
    update: (_e: unknown, w: any, p: any) => repo.update(w, p),
    save: (_e: unknown, v: any) => repo.save(v),
  }) };
  const config = { get: jest.fn((k: string, d?: unknown) => (k === 'refreshToken.secret' ? 'refresh-secret-value-1234' : d)) };
  return { service: new RefreshTokensService(repo, config as any), rows };
}

describe('RefreshTokensService (issue #1538)', () => {
  it('creates a token that is stored hashed, with device info', async () => {
    const { service, rows } = build();

    const created = await service.createToken('u1', { deviceName: 'Pixel', deviceOs: 'Android', ipAddress: '1.2.3.4' });

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(created.token);
    expect(rows[0]).toMatchObject({ userId: 'u1', deviceName: 'Pixel' });
  });

  it('rotation returns a new token and revokes the old one', async () => {
    const { service, rows } = build();
    const first = await service.createToken('u1');

    const second = await service.rotateToken(first.token);

    expect(second.token).not.toBe(first.token);
    expect(rows.find((r) => r.id === first.id)?.revokedAt).toBeTruthy();
    expect(rows.find((r) => r.id === first.id)?.replacedByTokenId).toBe(second.id);
  });

  it('replaying a rotated token revokes the whole family', async () => {
    const { service, rows } = build();
    const first = await service.createToken('u1');
    const second = await service.rotateToken(first.token);

    await expect(service.rotateToken(first.token)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(rows.find((r) => r.id === second.id)?.revokedAt).toBeTruthy();
  });

  it('unknown and expired tokens give 401', async () => {
    const { service, rows } = build();
    const created = await service.createToken('u1');
    rows[0].expiresAt = new Date(Date.now() - 1000);

    await expect(service.rotateToken('does-not-exist')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.rotateToken(created.token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokeByRawToken only touches the caller\'s rows', async () => {
    const { service, rows } = build();
    const mine = await service.createToken('u1');
    const theirs = await service.createToken('u2');

    expect(await service.revokeByRawToken('u1', theirs.token)).toBe(false);
    expect(rows.find((r) => r.id === theirs.id)?.revokedAt).toBeNull();
    expect(await service.revokeByRawToken('u1', mine.token)).toBe(true);
  });

  it('findActiveDevices lists only live sessions of the user', async () => {
    const { service } = build();
    const a = await service.createToken('u1', { deviceName: 'A' });
    await service.createToken('u1', { deviceName: 'B' });
    await service.createToken('u2', { deviceName: 'C' });
    await service.revokeToken('u1', a.id);

    const devices = await service.findActiveDevices('u1');

    expect(devices.map((d) => d.deviceName)).toEqual(['B']);
  });
});
