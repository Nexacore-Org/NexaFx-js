import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { RefreshTokensService } from './refresh-tokens.service';
import { RefreshToken } from '../auth/refresh-token.entity';

/** Issue #1529: rotation is an atomic claim; revoked sessions stop being active at once. */
interface Row {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  deviceName: string | null;
  deviceOs: string | null;
  ipAddress: string | null;
}

function build(rows: Row[]) {
  const table = rows.map((r) => ({ ...r }));
  const manager = {
    findOne: jest.fn(async (_e: unknown, { where }: any) => {
      const found = table.find((r) => (where.tokenHash ? r.tokenHash === where.tokenHash : r.id === where.id));
      return found ? { ...found } : null;
    }),
    // Conditional update: the atomic claim.
    update: jest.fn(async (_e: unknown, where: any, patch: any) => {
      const row = table.find((r) => r.id === where.id && r.revokedAt === null);
      if (!row) return { affected: 0 };
      Object.assign(row, patch);
      return { affected: 1 };
    }),
    save: jest.fn(async (_e: unknown, entity: Row) => {
      table.push({ ...entity });
      return entity;
    }),
  };
  const repo: any = {
    create: jest.fn((v) => v),
    findOne: jest.fn(async ({ where }: any) => table.find((r) => r.id === where.id && r.userId === where.userId) ?? null),
    update: jest.fn(async (where: any, patch: any) => {
      let affected = 0;
      for (const r of table) {
        if ((where.userId === undefined || r.userId === where.userId) && (where.familyId === undefined || r.familyId === where.familyId) && r.revokedAt === null) {
          Object.assign(r, patch);
          affected += 1;
        }
      }
      return { affected };
    }),
    delete: jest.fn(async () => ({ affected: 0 })),
    save: jest.fn(async (v: Row) => v),
    manager: { transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)) },
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => (key === 'refreshToken.secret' ? 'refresh-secret-value-1234' : fallback)),
  };
  const service = new RefreshTokensService(repo, config as any);
  return { service, table, repo, manager };
}

const live = (over: Partial<Row> = {}): Row => ({
  id: 'sess-1',
  userId: 'user-1',
  familyId: 'fam-1',
  tokenHash: '',
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  replacedByTokenId: null,
  deviceName: null,
  deviceOs: null,
  ipAddress: null,
  ...over,
});

/** Create a row whose hash matches `token` using the service's own hashing. */
function withToken(token: string, over: Partial<Row> = {}) {
  const { service } = build([]);
  const hash = (service as any).hashToken(token);
  return live({ tokenHash: hash, ...over });
}

describe('RefreshTokensService.rotateToken (issue #1529)', () => {
  it('rotates once: new token returned, old one revoked and linked', async () => {
    const { service, table } = build([withToken('old')]);

    const rotated = await service.rotateToken('old');

    expect(rotated.userId).toBe('user-1');
    expect(table.find((r) => r.id === 'sess-1')?.revokedAt).not.toBeNull();
    expect(table.find((r) => r.id === 'sess-1')?.replacedByTokenId).toBe(rotated.id);
    expect(table).toHaveLength(2);
  });

  it('two parallel refreshes with the same token: one wins, the other is reuse and kills the family', async () => {
    const { service, table } = build([withToken('old')]);

    const results = await Promise.allSettled([service.rotateToken('old'), service.rotateToken('old')]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(UnauthorizedException);
    // Only one child was ever minted, and the whole family is now revoked.
    expect(table).toHaveLength(2);
    expect(table.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('replaying an already-rotated token revokes the family', async () => {
    const { service, table } = build([withToken('old')]);
    await service.rotateToken('old');

    await expect(service.rotateToken('old')).rejects.toBeInstanceOf(UnauthorizedException);

    expect(table.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('rejects unknown and expired tokens with 401', async () => {
    const { service } = build([withToken('exp', { expiresAt: new Date(Date.now() - 1000) })]);
    await expect(service.rotateToken('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.rotateToken('exp')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('RefreshTokensService sessions (issue #1529)', () => {
  it('a session is active until it is revoked, and the revocation shows immediately', async () => {
    const { service } = build([live()]);

    await expect(service.isSessionActive('user-1', 'sess-1')).resolves.toBe(true);
    await service.revokeToken('user-1', 'sess-1');
    await expect(service.isSessionActive('user-1', 'sess-1')).resolves.toBe(false);
  });

  it('a session belonging to someone else is not active for the caller', async () => {
    const { service } = build([live()]);
    await expect(service.isSessionActive('user-2', 'sess-1')).resolves.toBe(false);
  });

  it('revokeAllExcept refuses an unknown current session instead of revoking everything', async () => {
    const { service, repo } = build([live()]);

    await expect(service.revokeAllExcept('user-1', '')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('revokeAllExcept keeps the current session', async () => {
    const { service, repo } = build([live()]);
    repo.update.mockResolvedValue({ affected: 2 });

    await expect(service.revokeAllExcept('user-1', 'sess-1')).resolves.toBe(2);
  });

  it('purges expired and long-revoked rows', async () => {
    const { service, repo } = build([]);
    repo.delete.mockResolvedValueOnce({ affected: 3 }).mockResolvedValueOnce({ affected: 4 });

    await expect(service.purgeStaleTokens(30)).resolves.toBe(7);
  });
});
