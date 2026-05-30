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
});
