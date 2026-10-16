import { TransactionsService } from './transactions.service';
import { Transaction } from './transaction.entity';

function build(driver: 'postgres' | 'better-sqlite3', query?: jest.Mock) {
  const txRepo = {
    create: jest.fn((v) => ({ ...v })),
    save: jest.fn(async (v) => v),
  };
  const dataSource = { options: { type: driver }, query: query ?? jest.fn() };
  const service = new TransactionsService(
    txRepo as any,
    dataSource as any,
    {} as any, // wallets
    {} as any, // stellar
    { get: jest.fn() } as any, // config
    { log: jest.fn() } as any, // audit
    {} as any, // mail
    { invalidateWalletBalanceCache: jest.fn() } as any, // users
    { emit: jest.fn() } as any, // events
    { check: jest.fn() } as any, // limits
    { calculateFee: jest.fn().mockReturnValue({ feeAmount: 0 }) } as any, // fees
    { isUserDeactivated: jest.fn().mockResolvedValue(false) } as any, // deactivation
    { ensureAccepted: jest.fn() } as any, // terms
  );
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  return { service, txRepo, dataSource };
}

const generate = (service: TransactionsService, tx: Partial<Transaction>) =>
  (service as unknown as { generateReceiptNumber(t: Partial<Transaction>): Promise<void> }).generateReceiptNumber(tx);

describe('generateReceiptNumber (#1373)', () => {
  const year = new Date().getFullYear();

  it('uses the Postgres sequence, zero-padded', async () => {
    const { service, txRepo } = build('postgres', jest.fn().mockResolvedValue([{ seq: '42' }]));
    const tx: Partial<Transaction> = { id: 't1' };
    await generate(service, tx);
    expect(tx.receiptNumber).toBe(`NXF-${year}-000042`);
    expect(txRepo.save).toHaveBeenCalledWith(tx);
  });

  it('rethrows (and logs) a sequence error on Postgres instead of falling back to a colliding scheme', async () => {
    const { service, txRepo } = build('postgres', jest.fn().mockRejectedValue(new Error('relation "transaction_receipt_seq" does not exist')));
    const tx: Partial<Transaction> = { id: 't1' };
    await expect(generate(service, tx)).rejects.toThrow('transaction_receipt_seq');
    expect(tx.receiptNumber).toBeUndefined();
    expect(txRepo.save).not.toHaveBeenCalled();
    expect(service['logger'].error).toHaveBeenCalled();
  });

  it('fails with a clear error when the sequence returns no row', async () => {
    const { service } = build('postgres', jest.fn().mockResolvedValue([]));
    await expect(generate(service, { id: 't1' })).rejects.toThrow('returned no value');
  });

  it('uses a random, column-sized fallback on non-Postgres drivers', async () => {
    const { service, dataSource } = build('better-sqlite3');
    const a: Partial<Transaction> = { id: 'a' };
    const b: Partial<Transaction> = { id: 'b' };
    await generate(service, a);
    await generate(service, b);
    expect(a.receiptNumber).toMatch(new RegExp(`^NXF-${year}-[0-9A-F]{8}$`));
    expect(a.receiptNumber!.length).toBeLessThanOrEqual(32);
    expect(a.receiptNumber).not.toBe(b.receiptNumber);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('retries with a fresh number after a unique violation', async () => {
    const { service, txRepo } = build('better-sqlite3');
    txRepo.save
      .mockRejectedValueOnce(Object.assign(new Error('UNIQUE constraint failed: transactions.receiptNumber'), { code: 'SQLITE_CONSTRAINT_UNIQUE' }))
      .mockImplementation(async (v) => v);
    const tx: Partial<Transaction> = { id: 't1' };
    await generate(service, tx);
    expect(txRepo.save).toHaveBeenCalledTimes(2);
    expect(tx.receiptNumber).toBeDefined();
  });

  it('does not retry on other errors, and gives up after repeated collisions', async () => {
    const { service, txRepo } = build('better-sqlite3');
    txRepo.save.mockRejectedValueOnce(new Error('connection lost'));
    await expect(generate(service, { id: 't1' })).rejects.toThrow('connection lost');
    expect(txRepo.save).toHaveBeenCalledTimes(1);

    txRepo.save.mockReset();
    txRepo.save.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(generate(service, { id: 't2' })).rejects.toThrow('dup');
    expect(txRepo.save).toHaveBeenCalledTimes(5);
  });
});

describe('createDeposit fullTransactionId (#1373)', () => {
  it('stores the saved transaction id in metadata, not undefined', async () => {
    const { service, txRepo } = build('better-sqlite3');
    let nextId = 0;
    txRepo.create.mockImplementation((v: object) => ({ ...v }));
    txRepo.save.mockImplementation(async (v: Partial<Transaction>) => {
      if (!v.id) v.id = `saved-${++nextId}`;
      return v;
    });
    (service as any).walletsService = { adjustBalance: jest.fn().mockResolvedValue(undefined) };

    const tx = await service.createDeposit({
      userId: 'u1',
      amount: 10,
      currency: 'USD',
      reference: 'ref-1',
      metadata: {},
    } as any);

    expect(tx.id).toBe('saved-1');
    expect((tx.metadata as Record<string, unknown>).fullTransactionId).toBe('saved-1');
  });
});
