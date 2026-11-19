import { EncryptionKeyBootCheck } from './encryption-key-boot-check.service';

const encryptionWith = (loaded: number[]) =>
  ({
    getMissingKeyVersions: (versions: number[]) => versions.filter((v) => !loaded.includes(v)),
  }) as any;

const dataSourceReturning = (rows: Array<{ keyVersion: number | string }>) =>
  ({ query: jest.fn().mockResolvedValue(rows) }) as any;

describe('EncryptionKeyBootCheck (issue #1549)', () => {
  it('passes when every stored key version has a loaded key', async () => {
    const check = new EncryptionKeyBootCheck(
      encryptionWith([1, 2]),
      dataSourceReturning([{ keyVersion: 1 }, { keyVersion: '2' }]),
    );
    await expect(check.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('passes on an empty table', async () => {
    const check = new EncryptionKeyBootCheck(encryptionWith([1]), dataSourceReturning([]));
    await expect(check.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('fails with the missing versions (and no key material) when a key is not loaded', async () => {
    const check = new EncryptionKeyBootCheck(
      encryptionWith([2]),
      dataSourceReturning([{ keyVersion: 1 }, { keyVersion: 2 }]),
    );
    await expect(check.onApplicationBootstrap()).rejects.toThrow(/key version\(s\) \[1\]/);
  });
});
