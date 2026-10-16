import { ForbiddenException } from '@nestjs/common';
import { TermsAcceptanceService } from './terms-acceptance.service';

describe('TermsAcceptanceService (#1353)', () => {
  const build = (version = '1.1') => {
    const rows: any[] = [];
    const repo = {
      findOne: jest.fn(async ({ where }: any) =>
        rows.find((r) => r.userId === where.userId && (!where.version || r.version === where.version)) ?? null,
      ),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => {
        rows.push({ id: `t${rows.length}`, acceptedAt: new Date(), ...v });
        return rows[rows.length - 1];
      }),
    };
    const config = { get: jest.fn().mockReturnValue(version) };
    return { service: new TermsAcceptanceService(repo as any, config as any), repo, rows };
  };

  it('accept is idempotent: a second accept returns the same record without inserting', async () => {
    const { service, repo } = build();
    const first = await service.accept({ userId: 'u1' });
    const second = await service.accept({ userId: 'u1' });
    expect(second).toBe(first);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('treats a concurrent unique violation as success', async () => {
    const { service, repo, rows } = build();
    repo.save.mockImplementationOnce(async () => {
      rows.push({ id: 'winner', userId: 'u1', version: '1.1', acceptedAt: new Date() });
      throw Object.assign(new Error('dup'), { code: '23505' });
    });
    await expect(service.accept({ userId: 'u1' })).resolves.toMatchObject({ id: 'winner' });
  });

  it('version bump flow: not accepted -> status asks for action -> accept -> status is clear', async () => {
    const { service } = build('1.1');
    await expect(service.getStatus('u1')).resolves.toMatchObject({
      currentVersion: '1.1',
      accepted: false,
      requiresAction: 'accept_terms',
    });
    await expect(service.ensureAccepted('u1')).rejects.toBeInstanceOf(ForbiddenException);

    await service.accept({ userId: 'u1' });
    await expect(service.getStatus('u1')).resolves.toMatchObject({ accepted: true, requiresAction: null });
    await expect(service.ensureAccepted('u1')).resolves.toBeUndefined();
  });
});
