import { EncryptionService } from './encryption.service';

const KEY_1 = '11'.repeat(32);
const KEY_2 = '22'.repeat(32);

function service(primary: string | undefined = KEY_1) {
  return new EncryptionService({ get: jest.fn((k: string) => (k === 'wallet.encryptionKey' ? primary : undefined)) } as any);
}

describe('EncryptionService (versioned)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('WALLET_ENCRYPTION_KEY')) delete process.env[k];
    }
  });
  afterAll(() => {
    process.env = saved;
  });

  it('round-trips a secret', () => {
    const svc = service();
    expect(svc.decrypt(svc.encrypt('SABC-secret'))).toBe('SABC-secret');
  });

  it('follows the documented rotation: old primary moves to _V1, new key becomes primary v2', () => {
    // Before rotation: KEY_1 is the primary at version 1.
    const before = service(KEY_1);
    const old = before.encrypt('stellar-secret');
    expect(old.keyVersion).toBe(1);

    // docs/security.md: new key is WALLET_ENCRYPTION_KEY, version 2; old key is _V1.
    process.env.WALLET_ENCRYPTION_KEY_VERSION = '2';
    process.env.WALLET_ENCRYPTION_KEY_V1 = KEY_1;
    const rotated = service(KEY_2);

    expect(rotated.getCurrentVersion()).toBe(2);
    expect(rotated.decrypt(old)).toBe('stellar-secret');
    expect(rotated.reencrypt(old).keyVersion).toBe(2);
    expect(rotated.decrypt(rotated.reencrypt(old))).toBe('stellar-secret');
  });

  it('always encrypts with the primary key, not the highest historic version', () => {
    process.env.WALLET_ENCRYPTION_KEY_V2 = KEY_2;
    const svc = service(KEY_1); // primary version 1
    expect(svc.getCurrentVersion()).toBe(1);
    expect(svc.encrypt('x').keyVersion).toBe(1);
  });

  it('reports versions that have no loaded key', () => {
    const svc = service(KEY_1);
    expect(svc.getMissingKeyVersions([1, 3, 2, 3])).toEqual([2, 3]);
  });

  it('fails at boot when no key is configured', () => {
    expect(() => service(undefined)).toThrow(/No wallet encryption key|missing/);
  });

  it.each(['abcd', 'zz'.repeat(32), '11'.repeat(31)])('rejects a bad key (%s) at construction', (bad) => {
    expect(() => service(bad)).toThrow(/64 hex characters/);
  });

  it('rejects a non-positive or non-integer primary version', () => {
    process.env.WALLET_ENCRYPTION_KEY_VERSION = '0';
    expect(() => service()).toThrow(/positive integer/);
    process.env.WALLET_ENCRYPTION_KEY_VERSION = 'abc';
    expect(() => service()).toThrow(/positive integer/);
  });

  it('detects a duplicate version instead of silently overwriting a key', () => {
    process.env.WALLET_ENCRYPTION_KEY_VERSION = '2';
    process.env.WALLET_ENCRYPTION_KEY_V2 = KEY_2;
    expect(() => service()).toThrow(/Duplicate wallet encryption key version 2/);
  });

  it('rejects a truncated ciphertext with a clear error', () => {
    const svc = service();
    expect(() => svc.decrypt({ ciphertext: Buffer.alloc(10).toString('base64'), keyVersion: 1 })).toThrow(/too short/);
  });

  it('rejects ciphertext for an unknown key version', () => {
    const svc = service();
    expect(() => svc.decrypt({ ciphertext: svc.encrypt('x').ciphertext, keyVersion: 9 })).toThrow(/No key available/);
  });
});
