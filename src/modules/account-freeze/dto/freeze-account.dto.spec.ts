import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FreezeAccountDto } from './freeze-account.dto';

const UUID = '3b241101-e2bb-4255-8caf-4136c566a962';
const check = (body: unknown) => validate(plainToInstance(FreezeAccountDto, body), { whitelist: true, forbidNonWhitelisted: true });

describe('FreezeAccountDto (issue #1524)', () => {
  it('accepts a normal request', async () => {
    expect(await check({ userId: UUID, reason: 'suspected account takeover' })).toHaveLength(0);
  });

  it.each([
    ['whitespace-only reason', { userId: UUID, reason: '          ' }],
    ['too short after trimming', { userId: UUID, reason: '  abc  ' }],
    ['unbounded reason', { userId: UUID, reason: 'x'.repeat(501) }],
    ['unbounded notes', { userId: UUID, reason: 'valid reason', notes: 'n'.repeat(1001) }],
  ])('rejects %s', async (_label, body) => {
    expect((await check(body)).length).toBeGreaterThan(0);
  });
});
