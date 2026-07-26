import { EncryptionService } from './encryption.service';

// 32-byte hex key for tests
const TEST_KEY = 'a'.repeat(64);

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = new EncryptionService(TEST_KEY);
  });

  it('encrypts and decrypts a roundtrip correctly', () => {
    const plaintext = 'hello world';
    const encrypted = service.encrypt(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('encrypt produces unique IVs on each call', () => {
    const plaintext = 'same input';
    const first = service.encrypt(plaintext);
    const second = service.encrypt(plaintext);
    expect(first).not.toBe(second);
  });

  it('ciphertext is different from plaintext', () => {
    const plaintext = 'sensitive data';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });

  it('throws when key length is not 32 bytes', () => {
    expect(() => new EncryptionService('short')).toThrow();
  });

  it('decrypts longer strings correctly', () => {
    const plaintext = 'x'.repeat(1000);
    expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
  });

  it('throws on tampered ciphertext (GCM auth tag check)', () => {
    const encrypted = service.encrypt('sensitive-data-long-enough');
    // Flip a byte in the ciphertext portion (after iv(16)+tag(16) = 32 bytes)
    const buf = Buffer.from(encrypted, 'base64');
    buf[32] ^= 0xff;
    expect(() => service.decrypt(buf.toString('base64'))).toThrow();
  });
});
