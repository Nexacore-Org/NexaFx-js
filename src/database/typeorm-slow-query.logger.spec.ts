import { TypeOrmSlowQueryLogger } from './typeorm-slow-query.logger';

describe('TypeOrmSlowQueryLogger', () => {
  it('emits a structured slow query log payload', () => {
    const warn = jest.fn();
    const logger = new TypeOrmSlowQueryLogger(1000, { warn });

    logger.logQuerySlow(1425, 'SELECT * FROM wallets WHERE id = $1', ['abc']);

    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'typeorm.slow_query',
        thresholdMs: 1000,
        durationMs: 1425,
        query: 'SELECT * FROM wallets WHERE id = $1',
        parameters: ['abc'],
      }),
    );
  });
});
