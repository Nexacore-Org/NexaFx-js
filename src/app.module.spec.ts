import { ConfigService } from '@nestjs/config';

describe('AppModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DISABLE_BULL: 'true',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USER: 'postgres',
      DB_PASSWORD: 'postgres',
      DB_NAME: 'nexafx',
      JWT_SECRET: 'a'.repeat(32),
      REFRESH_TOKEN_SECRET: 'b'.repeat(32),
      OTP_SECRET: 'c'.repeat(32),
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_USER: 'mailer@example.com',
      MAIL_PASSWORD: 'secret',
      MAIL_FROM: 'noreply@example.com',
    };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads with the test environment configuration', async () => {
    const { AppModule } = await import('./app.module');

    expect(AppModule).toBeDefined();
  });

  it('configures Bull from ConfigService redis settings rather than process.env', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DISABLE_BULL = 'false';
    process.env.REDIS_HOST = 'env-host';
    process.env.REDIS_PORT = '9999';
    process.env.REDIS_PASSWORD = 'env-password';

    jest.resetModules();

    const mockForRootAsync = jest.fn(() => ({ module: 'BullModule' }));
    const mockRegisterQueue = jest.fn(() => ({ queue: 'default' }));

    jest.doMock('@nestjs/bull', () => ({
      BullModule: {
        forRootAsync: mockForRootAsync,
        registerQueue: mockRegisterQueue,
      },
    }));

    const { AppModule } = await import('./app.module');

    expect(AppModule).toBeDefined();
    expect(mockForRootAsync).toHaveBeenCalled();

    const bullConfig = mockForRootAsync.mock.calls[0][0];
    expect(bullConfig.inject).toEqual([ConfigService]);

    const fakeConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'redis') {
          return {
            host: 'config-host',
            port: 1234,
            password: 'config-password',
          };
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    const result = bullConfig.useFactory(fakeConfigService);
    expect(result.redis.host).toBe('config-host');
    expect(result.redis.port).toBe(1234);
    expect(result.redis.password).toBe('config-password');
    expect(fakeConfigService.get).toHaveBeenCalledWith('redis');
    expect(result.redis.host).not.toBe('env-host');
    expect(result.redis.port).not.toBe(9999);
    expect(result.redis.password).not.toBe('env-password');
  });
});
