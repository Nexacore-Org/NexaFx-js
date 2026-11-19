import { buildTestDatabaseOptions, UnsafeTestDatabaseError } from './test-database-options';

const env = (extra: Record<string, string>) => extra as NodeJS.ProcessEnv;

describe('buildTestDatabaseOptions (issue #1545)', () => {
  it('rejects a missing database name instead of defaulting to "postgres"', () => {
    expect(() => buildTestDatabaseOptions(env({}))).toThrow(UnsafeTestDatabaseError);
    expect(() => buildTestDatabaseOptions(env({ TEST_DB_DATABASE: '   ' }))).toThrow(/not set/);
  });

  it.each(['postgres', 'nexafx_dev', 'nexafx', 'testing_data', 'nexafx_test_backup'])(
    'rejects %s',
    (name) => {
      expect(() => buildTestDatabaseOptions(env({ TEST_DB_DATABASE: name }))).toThrow(
        /Refusing to drop the schema/,
      );
    },
  );

  it.each(['nexafx_test', 'nexafx-test', 'NEXAFX_TEST', 'ci_test'])('accepts %s', (name) => {
    const options = buildTestDatabaseOptions(env({ TEST_DB_DATABASE: name }));
    expect(options.database).toBe(name);
    expect(options.dropSchema).toBe(true);
  });

  it('allows an explicit override', () => {
    const options = buildTestDatabaseOptions(
      env({ TEST_DB_DATABASE: 'scratch', TEST_DB_ALLOW_DROP: 'true' }),
    );
    expect(options.database).toBe('scratch');
  });

  it('reads connection settings from TEST_DB_* with local defaults', () => {
    const options = buildTestDatabaseOptions(
      env({ TEST_DB_DATABASE: 'nexafx_test', TEST_DB_HOST: 'db', TEST_DB_PORT: '5433' }),
    );
    expect(options).toMatchObject({ host: 'db', port: 5433, username: 'postgres' });
  });
});
