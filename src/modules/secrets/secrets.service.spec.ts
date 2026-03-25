import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { SecretsService } from './services/secrets.service';
import { SecretVersion } from './entities/secret-version.entity';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

describe('SecretsService rotation & guard integration', () => {
  let moduleRef: TestingModule;
  let service: SecretsService;
  let repo: Repository<SecretVersion>;

  beforeEach(async () => {
    process.env.SECRET_ENCRYPTION_KEY = '12345678901234567890123456789012';
    process.env.SECRET_GRACE_PERIOD_MINUTES = '5';

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [SecretVersion],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([SecretVersion]),
      ],
      providers: [SecretsService],
    }).compile();

    service = moduleRef.get(SecretsService);
    repo = moduleRef.get(getRepositoryToken(SecretVersion));
  });

  afterEach(async () => {
    jest.useRealTimers();
    await moduleRef.close();
  });

  const mockAuthService = { verifyUserIsActive: jest.fn().mockResolvedValue(true) } as any;

  const buildGuard = () => new JwtAuthGuard(service, mockAuthService);

  it('keeps prior version valid within grace window', async () => {
    const v1 = 'old-secret-value-'.padEnd(40, 'a');
    const v2 = 'new-secret-value-'.padEnd(40, 'b');

    await service.rotateSecret({ type: 'JWT', newValue: v1 });
    await service.rotateSecret({ type: 'JWT', newValue: v2 });

    const secrets = await service.getValidSecrets('JWT');

    expect(secrets).toEqual(expect.arrayContaining([v1, v2]));
    expect(secrets[0]).toBe(v2);
  });

  it('expires old version after grace period', async () => {
    jest.useFakeTimers();
    const start = new Date('2024-01-01T00:00:00Z');
    jest.setSystemTime(start);

    const oldValue = 'old-secret-expire'.padEnd(40, 'c');
    const newValue = 'new-secret-expire'.padEnd(40, 'd');

    await service.rotateSecret({ type: 'JWT', newValue: oldValue });
    await service.rotateSecret({ type: 'JWT', newValue: newValue, gracePeriodMinutes: 1 });

    expect(await service.getValidSecrets('JWT')).toEqual(
      expect.arrayContaining([oldValue, newValue]),
    );

    jest.setSystemTime(new Date(start.getTime() + 61_000));

    const validAfterGrace = await service.getValidSecrets('JWT');
    expect(validAfterGrace).toContain(newValue);
    expect(validAfterGrace).not.toContain(oldValue);
    expect(validAfterGrace.length).toBe(1);
  });

  it('allows concurrent validation with old and new tokens during grace', async () => {
    const guard = buildGuard();
    const userPayload = { sub: 'user-1' };
    const oldSecret = 'concurrent-old-secret'.padEnd(40, 'e');
    const newSecret = 'concurrent-new-secret'.padEnd(40, 'f');

    await service.rotateSecret({ type: 'JWT', newValue: oldSecret });
    await service.rotateSecret({ type: 'JWT', newValue: newSecret });

    const oldToken = jwt.sign(userPayload, oldSecret, { expiresIn: '10m' });
    const newToken = jwt.sign(userPayload, newSecret, { expiresIn: '10m' });

    const makeCtx = (token: string) => ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: `Bearer ${token}` },
          user: undefined,
        }),
      }),
    });

    await expect(guard.canActivate(makeCtx(oldToken) as any)).resolves.toBe(true);
    await expect(guard.canActivate(makeCtx(newToken) as any)).resolves.toBe(true);
  });

  it('rejects tokens signed with expired versions', async () => {
    jest.useFakeTimers();
    const guard = buildGuard();

    const oldSecret = 'expired-secret'.padEnd(40, 'g');
    const newSecret = 'active-secret'.padEnd(40, 'h');

    await service.rotateSecret({ type: 'JWT', newValue: oldSecret });
    await service.rotateSecret({ type: 'JWT', newValue: newSecret, gracePeriodMinutes: 1 });

    const token = jwt.sign({ sub: 'u123' }, oldSecret, { expiresIn: '10m' });

    jest.setSystemTime(new Date(Date.now() + 65_000));

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: `Bearer ${token}` },
          user: undefined,
        }),
      }),
    } as any;

    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired JWT token');
  });
});
