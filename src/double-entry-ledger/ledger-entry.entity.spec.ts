import { LedgerEntry, EntryType } from '../src/ledger/entities/ledger-entry.entity';

describe('LedgerEntry Entity — Immutability Guards', () => {
  let entry: LedgerEntry;

  beforeEach(() => {
    entry = new LedgerEntry();
    Object.assign(entry, {
      id: 'test-id',
      transactionId: 'tx-001',
      accountId: 'acc-001',
      debit: 100,
      credit: 0,
      currency: 'USD',
      entryType: EntryType.DEBIT,
      checksum: 'abc123',
      timestamp: new Date(),
    });
  });

  it('should throw on update attempt', () => {
    expect(() => entry.preventUpdate()).toThrow('Ledger entries are immutable and cannot be updated');
  });

  it('should throw on delete attempt', () => {
    expect(() => entry.preventDelete()).toThrow('Ledger entries are immutable and cannot be deleted');
  });

  it('should be instantiable with all required fields', () => {
    expect(entry.id).toBe('test-id');
    expect(entry.transactionId).toBe('tx-001');
    expect(entry.debit).toBe(100);
    expect(entry.credit).toBe(0);
    expect(entry.entryType).toBe(EntryType.DEBIT);
  });
});
