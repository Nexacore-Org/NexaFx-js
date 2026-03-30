import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';

import { WalletEncryptionService } from './services/wallet-encryption.service';
import { WalletService } from './services/wallet.service';
import { KeyRotationJob } from './jobs/key-rotation.job';
import { PrivateKeyRedactionInterceptor } from '../../common/interceptors/private-key-redaction.interceptor';
import { Wallet } from './entities/wallet.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_KEY_HEX = crypto.randomBytes(32).toString('hex'); // 64 hex chars
const OLD_KEY_HEX = crypto.randomBytes(32).toString('hex');

function makeConfigService(keyHex: string | null = TEST_KEY_HEX): Partial<ConfigService> {
  return {
    get: jest.fn().mockReturnValue(keyHex),
  };
}

function makeEncryptionService(keyHex = TEST_KEY_HEX): WalletEncryptionService {
  const svc = new WalletEncryptionService(makeConfigService(keyHex) as ConfigService);
  svc.onModuleInit();
  return svc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. WalletEncryptionService — unit tests
// ─────────────────────────────────────────────────────────────────────────────
describe('WalletEncryptionService', () => {
  let service: WalletEncryptionService;

  beforeEach(() => {
    service = makeEncryptionService();
  });

  // ── Initialisation ────────────────────────────────────────────────────────

  it('throws on missing WALLET_ENCRYPTION_KEY', () => {
    const badService = new WalletEncryptionService(
      makeConfigService(null) as ConfigService,
    );
    expect(() => badService.onModuleInit()).toThrow('WALLET_ENCRYPTION_KEY');
  });

  it('throws when key is too short', () => {
    const badService = new WalletEncryptionService(
      makeConfigService('deadbeef') as ConfigService,
    );
    expect(() => badService.onModuleInit()).toThrow('64-character');
  });

  // ── Encrypt / decrypt round-trip ──────────────────────────────────────────

  it('encrypts and decrypts a private key correctly', () => {
    const original = 'S0meP4ssphrase_or_64charHexPrivateKeyMaterial';
    const encrypted = service.encrypt(original);
    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('encrypts unicode / multi-byte characters correctly', () => {
    const original = '🔑私钥material_テスト';
    expect(service.decrypt(service.encrypt(original))).toBe(original);
  });

  // ── IV uniqueness ─────────────────────────────────────────────────────────

  it('produces a different ciphertext on every call (unique IV)', () => {
    const plaintext = 'identical-private-key-value';
    const results = new Set(Array.from({ length: 50 }, () => service.encrypt(plaintext)));
    // All 50 encryptions should be unique
    expect(results.size).toBe(50);
  });

  it('encrypted value contains a colon separator', () => {
    const enc = service.encrypt('test-key');
    expect(enc).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  });

  it('IV part decodes to exactly 16 bytes', () => {
    const enc = service.encrypt('test-key');
    const ivPart = enc.split(':')[0];
    expect(Buffer.from(ivPart, 'base64').length).toBe(16);
  });

  // ── Tamper detection (auth-tag validation) ────────────────────────────────

  it('throws when ciphertext is tampered', () => {
    const enc = service.encrypt('sensitive-key');
    const [iv, payload] = enc.split(':');
    // Flip the last byte of the payload
    const buf = Buffer.from(payload, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = `${iv}:${buf.toString('base64')}`;
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('throws on malformed encrypted string', () => {
    expect(() => service.decrypt('no-colon-here')).toThrow();
  });

  // ── Wrong key ─────────────────────────────────────────────────────────────

  it('throws when decryption uses the wrong key', () => {
    const wrongKey = Buffer.from(crypto.randomBytes(32));
    const enc = service.encrypt('my-secret');
    expect(() => service.decrypt(enc, wrongKey)).toThrow();
  });

  // ── isEncrypted helper ────────────────────────────────────────────────────

  it('correctly identifies encrypted values', () => {
    const enc = service.encrypt('key-material');
    expect(service.isEncrypted(enc)).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(service.isEncrypted('plain-private-key-value')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. WalletService — encryption on create/update
// ─────────────────────────────────────────────────────────────────────────────
describe('WalletService', () => {
  let walletService: WalletService;
  let encryptionService: WalletEncryptionService;
  let mockRepo: jest.Mocked<{
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  }>;

  beforeEach(async () => {
    encryptionService = makeEncryptionService();

    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: WalletEncryptionService, useValue: encryptionService },
        { provide: getRepositoryToken(Wallet), useValue: mockRepo },
      ],
    }).compile();

    walletService = module.get<WalletService>(WalletService);
  });

  it('never stores the plain-text private key', async () => {
    const dto = {
      address: '0xABCD',
      network: 'ethereum',
      privateKey: 'raw-secret-key-value',
      userId: 'user-uuid-1234',
    };

    const savedEntity: Partial<Wallet> = {
      id: 'wallet-uuid',
      address: dto.address,
      network: dto.network,
      userId: dto.userId,
      privateKeyEncrypted: encryptionService.encrypt(dto.privateKey),
      keyVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };

    mockRepo.create.mockReturnValue(savedEntity);
    mockRepo.save.mockResolvedValue(savedEntity);

    await walletService.create(dto);

    const createArg = mockRepo.create.mock.calls[0][0];
    expect(createArg.privateKey).toBeUndefined();
    expect(createArg.privateKeyEncrypted).toBeDefined();
    expect(createArg.privateKeyEncrypted).not.toContain(dto.privateKey);
    expect(encryptionService.isEncrypted(createArg.privateKeyEncrypted)).toBe(true);
  });

  it('response DTO never contains privateKeyEncrypted', async () => {
    const wallet: Partial<Wallet> = {
      id: 'wallet-uuid',
      address: '0xABCD',
      network: 'eth',
      userId: 'user-1',
      privateKeyEncrypted: 'iv:payload',
      keyVersion: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockRepo.findOne.mockResolvedValue(wallet);

    const response = await walletService.findById('wallet-uuid');

    const raw = response as unknown as Record<string, unknown>;
    expect(raw['privateKeyEncrypted']).toBeUndefined();
    expect(raw['privateKey']).toBeUndefined();
    expect(response.id).toBe('wallet-uuid');
  });

  it('increments keyVersion on private key update', async () => {
    const wallet: Partial<Wallet> = {
      id: 'wallet-uuid',
      address: '0xABCD',
      network: 'eth',
      userId: 'user-1',
      privateKeyEncrypted: encryptionService.encrypt('old-key'),
      keyVersion: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockRepo.findOne.mockResolvedValue(wallet);
    mockRepo.save.mockImplementation(async (w) => ({ ...w }));

    await walletService.updatePrivateKey('wallet-uuid', { privateKey: 'new-key' });

    const saveArg = mockRepo.save.mock.calls[0][0];
    expect(saveArg.keyVersion).toBe(2);
    expect(encryptionService.isEncrypted(saveArg.privateKeyEncrypted)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Key Rotation — correctness
// ─────────────────────────────────────────────────────────────────────────────
describe('KeyRotationJob', () => {
  it('re-encrypts from old key to new key correctly', () => {
    // Simulate: wallet was originally encrypted with OLD_KEY
    const oldService = makeEncryptionService(OLD_KEY_HEX);
    const plaintext = 'wallet-private-key-abc123';
    const encryptedWithOld = oldService.encrypt(plaintext);

    // Now rotate to TEST_KEY
    const newService = makeEncryptionService(TEST_KEY_HEX);
    const reEncrypted = newService.reEncrypt(encryptedWithOld, OLD_KEY_HEX);

    // Should be decryptable with the new key
    const decrypted = newService.decrypt(reEncrypted);
    expect(decrypted).toBe(plaintext);

    // Old encrypted value should NOT decrypt with new key
    expect(() => newService.decrypt(encryptedWithOld)).toThrow();
  });

  it('re-encrypted value has a different IV than the original', () => {
    const oldService = makeEncryptionService(OLD_KEY_HEX);
    const newService = makeEncryptionService(TEST_KEY_HEX);

    const enc1 = oldService.encrypt('secret');
    const enc2 = newService.reEncrypt(enc1, OLD_KEY_HEX);

    const iv1 = enc1.split(':')[0];
    const iv2 = enc2.split(':')[0];
    expect(iv1).not.toBe(iv2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PrivateKeyRedactionInterceptor — response safety
// ─────────────────────────────────────────────────────────────────────────────
describe('PrivateKeyRedactionInterceptor', () => {
  const interceptor = new PrivateKeyRedactionInterceptor();

  // Access the private redact method via casting for unit testing
  const redact = (data: unknown) =>
    (interceptor as unknown as { redact: (d: unknown) => unknown }).redact(data);

  it('removes privateKey from an object', () => {
    const input = { id: '1', address: '0x1', privateKey: 'secret' };
    const result = redact(input) as Record<string, unknown>;
    expect(result['privateKey']).toBeUndefined();
    expect(result['id']).toBe('1');
  });

  it('removes privateKeyEncrypted from an object', () => {
    const input = { id: '1', privateKeyEncrypted: 'iv:payload' };
    const result = redact(input) as Record<string, unknown>;
    expect(result['privateKeyEncrypted']).toBeUndefined();
  });

  it('removes snake_case variants', () => {
    const input = { id: '1', private_key: 'sec', private_key_encrypted: 'enc' };
    const result = redact(input) as Record<string, unknown>;
    expect(result['private_key']).toBeUndefined();
    expect(result['private_key_encrypted']).toBeUndefined();
  });

  it('recursively redacts nested objects', () => {
    const input = { wallet: { privateKey: 'deep-secret', address: '0x1' } };
    const result = redact(input) as Record<string, Record<string, unknown>>;
    expect(result['wallet']['privateKey']).toBeUndefined();
    expect(result['wallet']['address']).toBe('0x1');
  });

  it('recursively redacts items in arrays', () => {
    const input = [{ privateKey: 'a' }, { privateKey: 'b', address: '0x2' }];
    const result = redact(input) as Array<Record<string, unknown>>;
    expect(result[0]['privateKey']).toBeUndefined();
    expect(result[1]['privateKey']).toBeUndefined();
    expect(result[1]['address']).toBe('0x2');
  });

  it('returns null/undefined unchanged', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('does not modify objects with no sensitive fields', () => {
    const input = { id: '1', address: '0x1', network: 'eth' };
    expect(redact(input)).toEqual(input);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe('Encryption edge cases', () => {
  it('handles very long private key strings', () => {
    const svc = makeEncryptionService();
    const longKey = crypto.randomBytes(256).toString('hex'); // 512 chars
    expect(svc.decrypt(svc.encrypt(longKey))).toBe(longKey);
  });

  it('handles minimum-length private key (1 char)', () => {
    const svc = makeEncryptionService();
    expect(svc.decrypt(svc.encrypt('x'))).toBe('x');
  });

  it('produces distinct outputs for distinct inputs', () => {
    const svc = makeEncryptionService();
    const a = svc.encrypt('key-one');
    const b = svc.encrypt('key-two');
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('key-one');
    expect(svc.decrypt(b)).toBe('key-two');
  });
});
